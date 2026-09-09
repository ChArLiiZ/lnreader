import { getString } from '@strings/translations';
import sanitizeHtml from 'sanitize-html';

const PLUGIN_ISSUE_REPORT_URL =
  'https://github.com/lnreader/lnreader-plugins/issues/new';

export const isPluginIssueReportUrl = (url: string): boolean =>
  url === PLUGIN_ISSUE_REPORT_URL ||
  url.startsWith(`${PLUGIN_ISSUE_REPORT_URL}?`);

/** Custom scheme intercepted by the reader WebView to re-fetch the chapter. */
export const CHAPTER_REFRESH_URL = 'lnreader://refresh-chapter';

export const isChapterRefreshUrl = (url: string): boolean =>
  url === CHAPTER_REFRESH_URL;

// The empty-chapter message is HTML, and novel and chapter names come from
// plugins, so they cannot go in raw.
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character] as string),
  );

const getPluginIssueReportUrl = (
  pluginId: string,
  novelName: string,
  chapterName: string,
): string => {
  const title = `[${pluginId}] Empty chapter: ${novelName} — ${chapterName}`;
  return `${PLUGIN_ISSUE_REPORT_URL}?template=report_issue.yml&title=${encodeURIComponent(
    title,
  )}`;
};

export const sanitizeChapterText = (
  pluginId: string,
  novelName: string,
  chapterName: string,
  html: string,
): string => {
  const text = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'html',
      'head',
      'body',
      'link',
      'style',
      'meta',
      'del',
      'ins',
      'img',
      'audio',
      'video',
      'source',
      'object',
      'svg',
      'math',
      'title',
      'details',
      'summary',
      'ref',
    ]),
    allowedAttributes: {
      '*': [
        'data-*',
        'class',
        'id',
        'lang',
        'dir',
        'title',
        'epub:type',
        'role',
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
      ],
      a: ['href', 'name', 'target'],
      img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
      ol: ['reversed', 'start', 'type'],
      ul: ['type'],
      li: ['value'],
      p: ['align'],
      ref: ['href'],
      blockquote: ['cite'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'summary'],
      td: ['colspan', 'rowspan', 'align', 'valign'],
      th: ['colspan', 'rowspan', 'align', 'valign', 'scope'],
      audio: ['src', 'controls'],
      video: ['src', 'controls', 'width', 'height'],
      source: ['src', 'type', 'srcset'],
      svg: ['width', 'height', 'viewBox', 'xmlns'],
      q: ['cite'],
      time: ['datetime'],
      del: ['cite', 'datetime'],
      ins: ['cite', 'datetime'],
      link: ['rel', 'type', 'href', 'media'],
      meta: ['charset', 'name', 'content', 'http-equiv'],
    },
    allowedSchemes: ['data', 'http', 'https', 'file'],
  });

  return (
    text ||
    getString('readerScreen.emptyChapterMessage', {
      pluginId: escapeHtml(pluginId),
      novelName: escapeHtml(novelName),
      chapterName: escapeHtml(chapterName),
      reportUrl: escapeHtml(
        getPluginIssueReportUrl(pluginId, novelName, chapterName),
      ),
      refreshUrl: escapeHtml(CHAPTER_REFRESH_URL),
    })
  );
};
