import fs from 'fs';
import path from 'path';
import DashboardClient from '@/components/DashboardClient';

export default function HomePage() {
  const bodyHtml = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/dashboard-body.html'),
    'utf8'
  );

  return <DashboardClient bodyHtml={bodyHtml} />;
}
