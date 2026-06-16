import { redirect } from 'next/navigation';

export default function LegacySubmitHubRedirect() {
  redirect('/client/check-in');
}
