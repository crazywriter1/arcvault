import './globals.css';
import { WalletProvider } from '../components/WalletProvider';
import { ToastProvider } from '../components/Toast';

export const metadata = {
  title: 'ArcVault — AI Treasury Agent',
  description: 'Autonomous stablecoin treasury manager on Arc Network',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <WalletProvider>{children}</WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
