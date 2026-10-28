import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/EmptyState';

export default function NotFoundScreen() {
  return (
    <EmptyState message="There is nothing at this address.">
      {/* back to the home screen under this one (the stack's anchor) rather than a second home on top */}
      <Button label="Go home" onPress={() => router.dismissTo('/')} />
    </EmptyState>
  );
}
