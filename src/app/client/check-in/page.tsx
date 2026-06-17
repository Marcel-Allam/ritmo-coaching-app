import { redirect } from 'next/navigation';

export default function LegacyCheckInRedirect() {
  redirect('/client/coach');
}
