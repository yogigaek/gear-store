import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bottomSpace } from './bottom-space';

/** bottomSpace for this phone's insets: pass true when a BottomBar sits under the scrolling content */
export function useBottomSpace(aboveBar = false): number {
  return bottomSpace(useSafeAreaInsets().bottom, aboveBar);
}
