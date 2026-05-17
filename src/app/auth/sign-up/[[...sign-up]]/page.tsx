import { redirect } from 'next/navigation';

export default async function Page() {
  redirect('/auth/sign-in?signup=disabled');
}
