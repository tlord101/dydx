import React from 'react';
import { X } from 'lucide-react';

const AuthModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const web2Options = [
    { name: 'Google', icon: 'G', bgColor: '#FFFFFF', textColor: '#000000' },
    { name: 'Apple', icon: '', bgColor: '#000000', textColor: '#FFFFFF' },
  ];

  const web3Options = [
    { name: 'MetaMask', icon: '🦊', bgColor: '#1C1C28', textColor: '#FFFFFF' },
    { name: 'Trust Wallet', icon: '🛡️', bgColor: '#1C1C28', textColor: '#FFFFFF' },
    { name: 'OKX Wallet', icon: 'O', bgColor: '#1C1C28', textColor: '#FFFFFF' },
    { name: 'WalletConnect', icon: 'W', bgColor: '#1C1C28', textColor: '#FFFFFF' },
  ];

  const handleOptionClick = (option) => {
    console.log(`Selected: ${option}`);
    // In a real app, this would trigger the authentication flow
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-75"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-xl font-semibold text-white">Sign in</h2>
          <button
            onClick={onClose}
            className="p-1 text-textGrey hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-textGrey text-sm mb-6">
          To get started, sign in with your social accounts, email or connect your wallet.
        </p>

        {/* Web2 Options */}
        <div className="space-y-2 mb-4">
          {web2Options.map((option) => (
            <button
              key={option.name}
              onClick={() => handleOptionClick(option.name)}
              className="w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 hover:opacity-80"
              style={{ 
                backgroundColor: option.bgColor,
                color: option.textColor 
              }}
            >
              {option.icon && <span className="text-lg">{option.icon}</span>}
              {option.name === 'Apple' && (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              )}
              <span>Continue with {option.name}</span>
            </button>
          ))}
        </div>

        {/* Email Input */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full bg-background text-white py-3 px-4 rounded-lg outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-background rounded">
              <svg className="w-5 h-5 text-textGrey" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-gray-700" />
          <span className="px-3 text-textGrey text-xs">or</span>
          <div className="flex-1 border-t border-gray-700" />
        </div>

        {/* Web3 Options */}
        <div className="space-y-2 mb-4">
          {web3Options.map((option) => (
            <button
              key={option.name}
              onClick={() => handleOptionClick(option.name)}
              className="w-full py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 hover:opacity-80"
              style={{ 
                backgroundColor: option.bgColor,
                color: option.textColor 
              }}
            >
              <span className="text-lg">{option.icon}</span>
              <span>{option.name}</span>
            </button>
          ))}
        </div>

        {/* View more wallets */}
        <button className="w-full text-textGrey text-sm py-2 flex items-center justify-center gap-2 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>View more wallets</span>
        </button>

        {/* Footer */}
        <p className="text-textGrey text-xs text-center mt-4">
          By signing up, you agree to the <span className="text-primary">Terms of Use</span> and <span className="text-primary">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
