import { FileService } from '@platform';

export const ROOT_STORAGE = FileService.getExternalDirectoryPath();
export const PLUGIN_STORAGE = ROOT_STORAGE + '/Plugins';
export const NOVEL_STORAGE = ROOT_STORAGE + '/Novels';
