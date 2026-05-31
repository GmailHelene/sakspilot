import type { Metadata } from 'next';
import Header from '@/components/Header';
import LastNedClient from './LastNedClient';

export const metadata: Metadata = {
  title: 'Last ned Sakspilot Desktop',
  description:
    'Last ned Sakspilot Desktop for Windows, macOS eller Linux — appen som kobler timer automatisk til prosjekter via vindustittel.',
};

export default function LastNedPage() {
  return (
    <>
      <Header />
      <LastNedClient />
    </>
  );
}
