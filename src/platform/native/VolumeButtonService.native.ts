import NativeVolumeButtonListener from '@specs/NativeVolumeButtonListener';
import type { IVolumeButtonService } from '../types';

export const VolumeButtonService: IVolumeButtonService = {
  addListener: eventName => NativeVolumeButtonListener.addListener(eventName),
  removeListeners: count => NativeVolumeButtonListener.removeListeners(count),
};

/** Raw TurboModule needed for NativeEventEmitter. */
export const VolumeButtonNativeModule = NativeVolumeButtonListener;
