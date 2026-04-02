import NativeEpub from '@specs/NativeEpub';
import type { IEpubService, EpubNovel } from '../types';

export const EpubService: IEpubService = {
  parseNovelAndChapters: epubDirPath =>
    NativeEpub.parseNovelAndChapters(epubDirPath) as EpubNovel,
};
