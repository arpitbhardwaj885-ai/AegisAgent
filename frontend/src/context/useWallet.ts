import { useContext } from 'react';
import { WalletContext } from './WalletContextTypes';

export const useWallet = () => useContext(WalletContext);
