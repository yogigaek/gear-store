import { openWeb } from '../lib/web';
import { Button } from './Button';

/** The app is the shop; the admin side (orders, stock, revenue) is on the web, with its own demo account. */
export function AdminOnWeb() {
  return (
    <Button
      variant="ghost"
      label="Admin dashboard (web) · demo sign-in, read-only"
      onPress={() => void openWeb('/admin')}
      accessibilityRole="link"
      accessibilityHint="Opens the Rakit website"
    />
  );
}
