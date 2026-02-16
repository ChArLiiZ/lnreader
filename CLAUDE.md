# CLAUDE.md — LNReader

## Project Overview

LNReader is a free, open-source light novel reader for Android (7.0+), built with React Native and Expo. It uses a plugin system to browse and read novels from various sources, with features like offline reading, backup/restore, and tracker integration (MAL, AniList).

## Tech Stack

- **Framework**: React Native 0.81 + Expo 54
- **Language**: TypeScript 5.9 (strict, `noUnusedLocals: true`)
- **UI**: React Native Paper (Material Design 3), Reanimated, React Navigation v7
- **Storage**: Expo SQLite (relational data), MMKV (settings/preferences)
- **Package Manager**: pnpm 9.15 (Node >= 20)
- **React**: v19 with React Compiler enabled

## Commands

```bash
pnpm install                    # Install dependencies
pnpm run dev:start              # Start Metro bundler
pnpm run dev:android            # Run on Android
pnpm run dev:clean-start        # Metro with cache reset
pnpm run build:release:android  # Build release APK
pnpm run lint                   # ESLint check
pnpm run lint:fix               # Auto-fix lint issues
pnpm run format                 # Prettier format
pnpm run format:check           # Check formatting
pnpm run type-check             # TypeScript type check
```

## Project Structure

```
src/
  api/            # Google Drive, remote server APIs
  components/     # Reusable UI components (each in own folder with index.ts)
  database/       # SQLite: tables/, queries/, migrations/, types/
  hooks/          # common/ (utility hooks), persisted/ (MMKV-backed hooks)
  navigators/     # React Navigation config (Main, BottomNavigator, stacks)
  plugins/        # Plugin system (pluginManager, helpers, types)
  screens/        # Feature screens (library, browse, novel, reader, settings, etc.)
  services/       # Business logic (download, backup, epub, migrate, updates)
  theme/          # MD3 theming, colors, types
  utils/          # Shared utilities, constants, fetch helpers
strings/          # i18n translations (languages/, types/)
specs/            # Native module specs (TurboModules)
```

## Path Aliases

Configured in both `tsconfig.json` and `babel.config.js`:

| Alias | Path |
|-------|------|
| `@components` | `src/components` |
| `@database` | `src/database` |
| `@hooks` | `src/hooks` |
| `@screens` | `src/screens` |
| `@strings` | `strings` |
| `@services` | `src/services` |
| `@plugins` | `src/plugins` |
| `@utils` | `src/utils` |
| `@theme` | `src/theme` |
| `@navigators` | `src/navigators` |
| `@api` | `src/api` |
| `@type` | `src/type` |
| `@specs` | `specs` |

## Code Conventions

### Style & Formatting
- **Prettier**: 2-space indent, single quotes, trailing commas (all), no parens on single-arg arrows, auto line endings
- **ESLint**: `@react-native` base config. Key rules:
  - `no-console: error` — no console.log statements
  - `prefer-const: error` — use `const` over `let`
  - `no-var: error` — no `var`
  - `curly: ['error', 'multi-line', 'consistent']`
  - `no-duplicate-imports: error`

### Naming
- Components & screens: **PascalCase** files (`LibraryScreen.tsx`, `Appbar.tsx`)
- Utilities & hooks: **camelCase** files (`useTheme.ts`, `showToast.ts`)
- Hooks: `useXXX` prefix
- Database queries: `XXXQueries.ts`
- Context providers: `XXXContext.tsx`

### Patterns
- **Functional components only** with hooks (no class components)
- **TypeScript interfaces** for all props (named `XXXProps`)
- **React Context** for shared state (LibraryContext, UpdateContext)
- **Persisted hooks** pattern for MMKV-backed settings (`useSettings`, `useTheme`)
- **Feature folders** for screens with local components/, hooks/, constants/
- **Index exports** (`index.ts`) for clean imports from component folders
- **Lazy loading** screens with React Suspense for performance

### Database
- Expo SQLite with typed async queries
- Database triggers for computed columns
- Migration system for schema evolution

### Plugin System
- Plugins loaded dynamically from URLs, executed in sandboxed Function scope
- Plugin-scoped storage (not global)
- Fetch helpers for standardized network access

## Key Architecture Decisions

- **MMKV** for fast key-value reads (settings, theme) vs. SQLite for relational data (novels, chapters, categories)
- **React Navigation native stack** for screen transitions
- **Background Actions** service for downloads, library updates, backups
- **React Compiler** (v19) enabled via Babel — components auto-memoized
- **Material Design 3** via React Native Paper for consistent UI
