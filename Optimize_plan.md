# LNReader 效能優化與 QOL 改善計畫

> 基於全面程式碼審查產生的優化建議，按影響程度與實作難度排序。

---

## 一、效能優化（Performance）

### P1: insertChapters N+1 查詢 — CRITICAL

- **檔案**: `src/database/queries/ChapterQueries.ts:46-91`
- **問題**: 每個 chapter 各執行 1~2 次 SQL（INSERT + conditional UPDATE），整體在 `withTransactionAsync` 中逐筆操作
  ```typescript
  for (let index = 0; index < chapters.length; index++) {
    const result = await db.runAsync(`INSERT INTO Chapter ...`);
    if (!insertId || insertId < 0) {
      await db.runAsync(`UPDATE Chapter SET ...`);
    }
  }
  ```
- **影響**: 匯入含 1000+ 章的小說需要 10+ 秒
- **建議方案**: 改用批次 INSERT，例如 `INSERT OR IGNORE INTO Chapter (...) VALUES (?,?,...), (?,?,...)` 一次插入多筆，再用單一 `UPDATE ... WHERE path IN (...)` 更新需要變動的欄位
- **驗證**: 匯入 500+ 章小說，比較修改前後耗時

---

### P2: LibraryContext 過度觸發 re-render — HIGH

- **檔案**: `src/components/Context/LibraryContext.tsx`（全 36 行）
- **問題**: 單一 Context 包含所有資料（library array、categories、所有 callback functions、settings），任一變動觸發全部 consumer re-render
  ```typescript
  <LibraryContext.Provider value={{ ...useLibraryParams, settings }}>
  ```
  `useLibraryParams` 包含 `library: NovelInfo[]`、`allCategories`、`selectedSubCategoryIds`、多個 callback 等
- **影響**: 切換 category、搜尋、排序時整個 library 畫面所有子元件重繪
- **建議方案**: 拆分為 3 個 Context：
  1. `LibraryDataContext` — novels / categories（頻繁更新）
  2. `LibraryActionsContext` — stable callback functions（幾乎不變）
  3. `LibrarySettingsContext` — filter / sort / display settings
- **相關檔案**:
  - `src/screens/library/LibraryScreen.tsx`（consumer）
  - `src/screens/library/hooks/useLibrary.ts`（data source）
  - `src/hooks/persisted/useSettings.ts`（LibrarySettings）
- **驗證**: React DevTools Profiler 確認 re-render 次數減少

---

### P3: HistoryScreen groupHistoryByDate 未 memoize — HIGH

- **檔案**: `src/screens/history/HistoryScreen.tsx:47-71`
- **問題**: `groupHistoryByDate()` 函數在每次 render 都執行完整的 `.reduce()` + `.map()` 重新分組，搜尋每次按鍵都觸發 O(n) 重組
  ```typescript
  const groupHistoryByDate = (rawHistory: History[]) => {
    const dateGroups = rawHistory.reduce<Record<string, History[]>>(...);
    return Object.keys(dateGroups).map(date => ({ date, data: dateGroups[date] }));
  };
  ```
  此函數在 SectionList 的 `sections` prop 中被直接呼叫
- **影響**: 大量歷史記錄時搜尋卡頓
- **建議方案**: 用 `useMemo` 包裝 sections 計算
  ```typescript
  const sections = useMemo(
    () => groupHistoryByDate(searchText ? searchResults : history),
    [searchText ? searchResults : history],
  );
  ```
- **驗證**: 輸入搜尋文字時確認不再有明顯延遲

---

### P4: UpdatesScreen sections 未 memoize — HIGH

- **檔案**: `src/screens/updates/UpdatesScreen.tsx:97-116`
- **問題**: `.filter().reduce()` 直接寫在 SectionList 的 `sections` prop 中，每次 render 都執行
  ```typescript
  sections={updatesOverview
    .filter(v => searchText ? v.novelName.toLowerCase().includes(...) : true)
    .reduce((acc, cur) => { ... }, [])}
  ```
- **影響**: 500+ 筆更新時搜尋明顯卡頓
- **建議方案**: 移到 `useMemo`
  ```typescript
  const sections = useMemo(() =>
    updatesOverview
      .filter(...)
      .reduce(...),
    [updatesOverview, searchText],
  );
  ```
- **驗證**: 同 P3

---

### P5: NovelCategory 缺少資料庫索引 — HIGH

- **檔案**: `src/database/tables/NovelCategoryTable.ts`
- **問題**: NovelCategory 關聯表沒有索引，`CategoryQueries.ts:36-62` 的 JOIN 查詢做 full table scan
  ```sql
  SELECT DISTINCT n.* FROM Novel n
  INNER JOIN NovelCategory nc ON n.id = nc.novelId
  WHERE n.inLibrary = 1
  ```
  目前只有 Novel 表有索引（`NovelIndex ON Novel(pluginId, path, id, inLibrary)`）
- **影響**: library 載入和 category 切換變慢（尤其 10k+ mapping rows 時）
- **建議方案**: 新增索引
  ```sql
  CREATE INDEX IF NOT EXISTS idx_nc_categoryId ON NovelCategory(categoryId, novelId);
  CREATE INDEX IF NOT EXISTS idx_nc_novelId ON NovelCategory(novelId);
  ```
- **相關檔案**: `src/database/db.ts`（createInitialSchema）, `src/database/migrations/`
- **驗證**: `EXPLAIN QUERY PLAN` 確認索引被使用

---

### P6: Library 更新逐筆處理加 500ms delay — HIGH

- **檔案**: `src/services/updates/index.ts:91-131`
- **問題**: for loop 逐本小說更新，每本之間 `await sleep(500)`
  ```typescript
  for (let i = 0; i < libraryNovels.length; i++) {
    // ... update logic
    await sleep(INTER_NOVEL_DELAY_MS); // 500ms
  }
  ```
  100 本 = 最少 50 秒，不含實際更新時間
- **影響**: Library 更新緩慢，使用者等待時間過長
- **建議方案**:
  1. 改為可配置的並行更新（例如 `Promise.allSettled` 搭配 concurrency limit = 3）
  2. 根據錯誤類型決定是否 retry（網路逾時 → retry，Plugin 錯誤 → skip）
  3. 將 delay 改為可配置或移除
- **驗證**: 100 本小說的 library update，比較總時間

---

### P7: ServiceManager 重複反序列化 task list — MEDIUM

- **檔案**: `src/services/ServiceManager.ts:282,384-420`
- **問題**: main loop 的 while 迴圈每次迭代都呼叫 `getTaskList()`，該函數從 MMKV 讀取整個陣列並 JSON.parse，還包含舊格式轉換邏輯
- **影響**: 背景任務執行效率低
- **建議方案**: 在 loop 開始時讀取一次並快取，僅在新增/移除 task 時重新讀取
- **驗證**: 加入 performance.now() 計時確認改善

---

### P8: NovelCover headers 每次 render 重建 — MEDIUM

- **檔案**: `src/components/NovelCover.tsx:129-132`
- **問題**: 每次 render 都呼叫 `getUserAgent()` 並建立新的 headers object
  ```typescript
  const headers = imageRequestInit?.headers || {
    'User-Agent': getUserAgent(), // 每次 render 都呼叫
  };
  ```
  新 object reference 導致 Image 元件認為 source 改變 → cache miss
- **影響**: library 捲動時圖片閃爍或重新載入
- **建議方案**: 用 `useMemo` 快取 headers
  ```typescript
  const headers = useMemo(
    () => imageRequestInit?.headers || { 'User-Agent': getUserAgent() },
    [imageRequestInit?.headers],
  );
  ```
- **驗證**: Library 畫面快速捲動，確認圖片不再閃爍

---

### P9: ImageRequestInitMap 隨 novels 變動全部重建 — MEDIUM

- **檔案**: `src/screens/library/components/LibraryListView.tsx:44-52`
- **問題**: `useMemo` 的 dependency 是 `[novels]`，但實際只用到 `novel.pluginId`。任何小說資料變更都導致整個 map 重建
  ```typescript
  const imageRequestInitMap = useMemo(() => {
    const map = new Map();
    for (const novel of novels) {
      if (!map.has(novel.pluginId)) {
        map.set(novel.pluginId, getPlugin(novel.pluginId)?.imageRequestInit);
      }
    }
    return map;
  }, [novels]); // novels 變了就重建
  ```
- **建議方案**: 先提取 unique pluginIds，以其作為 dependency
  ```typescript
  const pluginIds = useMemo(
    () => [...new Set(novels.map(n => n.pluginId))].sort().join(','),
    [novels],
  );
  const imageRequestInitMap = useMemo(() => { ... }, [pluginIds]);
  ```
- **驗證**: React DevTools Profiler 確認不再因 novel data 變化而重建 map

---

### P10: UpdateContext memoization 無效 — MEDIUM

- **檔案**: `src/components/Context/UpdateContext.tsx:15-20`
- **問題**: `useMemo` 的 dependency 是 `useUpdateParams`（hook 回傳的新 object），等於每次都是新 reference
  ```typescript
  const contextValue = useMemo(
    () => ({ ...useUpdateParams }),
    [useUpdateParams], // 永遠是新 reference
  );
  ```
- **建議方案**: 解構 `useUpdates()` 回傳值，個別作為 dependency
  ```typescript
  const { updatesOverview, getUpdates, lastUpdateTime, ... } = useUpdates();
  const contextValue = useMemo(
    () => ({ updatesOverview, getUpdates, lastUpdateTime, ... }),
    [updatesOverview, getUpdates, lastUpdateTime, ...],
  );
  ```
- **驗證**: React DevTools 確認 consumer 不再無謂 re-render

---

## 二、QOL 改善（Quality of Life）

### Q1: 錯誤訊息過於通用 — HIGH

- **相關檔案**:
  - `src/screens/BrowseSourceScreen/useBrowseSource.ts:54` — `setError(\`${err}\`)`
  - `src/screens/reader/ReaderScreen.tsx:99-122` — 通用 ErrorScreenV2
  - 多處 catch block 使用相同模式
- **問題**: 使用者看到 `[object Object]` 或模糊的錯誤訊息，無法分辨是網路問題、Plugin 壞掉、還是內容解析失敗
- **建議方案**:
  1. 在 `src/utils/error.ts` 建立 error 分類
     ```typescript
     export class NetworkError extends Error { ... }
     export class PluginError extends Error { ... }
     export class ParseError extends Error { ... }
     ```
  2. 各 catch block 根據 error 類型顯示不同提示（搭配 i18n）
  3. ErrorScreenV2 根據類型顯示不同的 icon 和建議動作
- **驗證**: 模擬斷網 / plugin 錯誤，確認顯示對應訊息

---

### Q2: TaskQueue 缺少個別取消功能 — HIGH

- **檔案**: `src/screens/more/TaskQueueScreen.tsx:36`
- **問題**: 有 TODO 標記 `//TODO: there should probably be a way to cancel a specific task from this screen`，目前只能取消全部任務
- **建議方案**:
  1. ServiceManager 新增 `removeTask(id: string)` 方法
  2. TaskQueueScreen 每個 task item 加上 swipe-to-cancel 或刪除按鈕
- **相關檔案**: `src/services/ServiceManager.ts`
- **驗證**: 排入多個下載任務，確認可以個別取消

---

### Q3: Backup 失敗無法得知哪些小說出錯 — MEDIUM

- **檔案**: `src/services/backup/utils.ts:82-100`
- **問題**: 單本小說 backup 失敗只顯示 toast 繼續，完成後沒有彙報哪些成功、哪些失敗
- **建議方案**:
  1. 收集 `{ success: string[], failed: { name: string, error: string }[] }`
  2. 備份結束後顯示摘要通知：「完成：X 本成功 / Y 本失敗」
  3. 可選：提供失敗列表讓使用者重試
- **驗證**: 模擬部分 novel 備份失敗，確認顯示摘要

---

### Q4: Backup 暫存檔未清理 — MEDIUM

- **檔案**: `src/services/backup/local/index.ts:154`
- **問題**: 有 TODO 標記 `// TODO: unlink here too?`，restore 完成後暫存檔案可能殘留
- **另外**: 同檔案 line 104 `allowVirtualFiles: true, // TODO: hopefully this just works`
- **建議方案**: 在 restore 的 `finally` block 中加入 temp file 清理
  ```typescript
  finally {
    await NativeFile.unlink(tempPath).catch(() => {});
  }
  ```
- **驗證**: 執行 restore 後確認 temp 目錄沒有殘留檔案

---

### Q5: 缺少搜尋歷史記錄 — LOW

- **檔案**: `src/screens/GlobalSearchScreen/GlobalSearchScreen.tsx`
- **問題**: 每次搜尋都要重新輸入，沒有最近搜尋紀錄
- **建議方案**:
  1. 用 MMKV 儲存最近 10 筆搜尋紀錄（key: `GLOBAL_SEARCH_HISTORY`）
  2. 搜尋欄 focus 時顯示最近搜尋 chip
  3. 長按可刪除單筆紀錄
- **驗證**: 搜尋後返回，確認歷史紀錄顯示

---

### Q6: 部分 UI 字串未走 i18n — LOW

- **範例檔案**:
  - `src/screens/settings/SettingsReaderScreen/tabs/AccessibilityTab.tsx:70` — `"Reading Enhancements"` hardcoded
  - 其他散落的英文字串
- **問題**: 非英語使用者看到混合語言的界面
- **建議方案**: 全域搜尋 hardcoded 字串，補上 `getString()` 並在 `strings/languages/` 中新增翻譯 key
- **驗證**: 切換語言後確認所有字串都已翻譯

---

## 三、程式碼品質 & DX（Developer Experience）

### D1: `any` type 過多（50+ 處） — MEDIUM

- **主要位置**:
  - `src/services/backup/utils.ts:39`
  - `src/navigators/BottomNavigator.tsx:63`
  - `src/services/Trackers/myAnimeList.ts:101-102`
  - `src/services/Trackers/aniList.ts:90`
  - `src/components/Common.tsx:9`
- **影響**: 降低型別安全、IDE 自動完成失效、runtime 錯誤難以預防
- **建議方案**: 逐步替換為正確型別，優先處理 public API 的 `any`
- **驗證**: `pnpm run type-check` 通過且 `any` 數量減少

---

### D2: 完全沒有自動測試 — MEDIUM

- **問題**: 專案中找不到 `__tests__/` 目錄或 `*.test.*` 檔案
- **影響**: 重構風險高，regression 無法自動偵測
- **建議方案**: 從核心純邏輯開始補測試：
  1. `src/database/queries/` — query functions（用 in-memory SQLite）
  2. `src/plugins/pluginManager.ts` — plugin loading / caching
  3. `src/services/ServiceManager.ts` — task queue management
  4. `src/utils/` — utility functions
- **工具**: Jest（已在 React Native preset 中）+ @testing-library/react-native
- **驗證**: `pnpm test` 可執行且通過

---

### D3: markChaptersRead SQL injection 風險 — MEDIUM

- **檔案**: `src/database/queries/ChapterQueries.ts:110`
- **問題**: `chapterIds.join(',')` 直接拼接到 SQL 字串中
  ```typescript
  export const markChaptersRead = (chapterIds: number[]) =>
    db.execAsync(
      `UPDATE Chapter SET \`unread\` = 0 WHERE id IN (${chapterIds.join(',')})`,
    );
  ```
  雖然 `chapterIds` 是 `number[]`，但如果上游傳入被污染的資料仍有風險
- **建議方案**: 改用 parameterized query
  ```typescript
  const placeholders = chapterIds.map(() => '?').join(',');
  db.runAsync(`UPDATE Chapter SET unread = 0 WHERE id IN (${placeholders})`, ...chapterIds);
  ```
- **同類問題**: `CategoryQueries.ts:28-42` 的 `getCategoriesWithCountQuery` 也有相同模式
- **驗證**: 含特殊字元的測試資料不造成 SQL error

---

### D4: WebViewReader.tsx 過長（550+ 行） — LOW

- **檔案**: `src/screens/reader/components/WebViewReader.tsx`
- **問題**: 混合了 settings management、TTS 控制、WebView lifecycle、message handling 等多種職責
- **建議方案**: 拆分為子元件/hooks：
  - `useReaderSettings.ts` — settings 相關邏輯
  - `useReaderTTS.ts` — TTS 控制邏輯
  - `ReaderWebView.tsx` — 純 WebView 渲染
- **驗證**: 功能不變，每個檔案 < 200 行

---

## 四、實作優先順序建議

| 階段 | 項目 | 預估複雜度 | 主要效益 |
|------|------|-----------|---------|
| **Phase 1** | P1 (batch insert), P3 (history memo), P4 (updates memo), P8 (cover headers) | 低~中 | 最快見效的低風險改動 |
| **Phase 2** | P5 (DB indexes), P10 (UpdateContext), D3 (SQL injection fix), Q4 (temp cleanup) | 低~中 | 資料庫與安全性改善 |
| **Phase 3** | P2 (Context splitting), P9 (imageRequestInitMap), Q1 (error types) | 中 | 架構性改善 |
| **Phase 4** | P6 (parallel updates), P7 (ServiceManager cache), Q2 (task cancel) | 中~高 | 背景任務效能與 UX |
| **Phase 5** | Q3 (backup summary), Q5 (search history), Q6 (i18n), D1 (any types), D2 (tests), D4 (refactor) | 低~中 | 長期品質提升 |

---

## 五、驗證方式總覽

| 項目 | 驗證方法 |
|------|---------|
| P1 | 匯入 500+ 章小說，比較修改前後耗時 |
| P2, P3, P4, P9, P10 | React DevTools Profiler 確認 re-render 次數減少 |
| P5 | `EXPLAIN QUERY PLAN` 確認索引命中 |
| P6 | 100 本小說 library update 總時間比較 |
| P7 | `performance.now()` 計時確認改善 |
| P8 | Library 快速捲動，圖片不閃爍 |
| Q1 | 模擬斷網 / plugin error，確認訊息分類正確 |
| Q2 | 多個任務排入後個別取消 |
| D3 | 含特殊字元的資料不造成 SQL error |
| **全部** | `pnpm run lint && pnpm run type-check` 通過 |
