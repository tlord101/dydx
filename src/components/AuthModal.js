import React from 'react';
import { X } from 'lucide-react';

const AuthModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const web2Options = [
    { name: 'Google', icon: '🔵' },
    { name: 'Apple', icon: '🍎' },
  ];

  const web3Options = [
    { name: 'MetaMask', icon: '🦊' },
    { name: 'Trust Wallet', icon: '🛡️' },
    { name: 'WalletConnect', icon: '🔗' },
  ];

  const handleOptionClick = (option) => {
    console.log(`Selected: ${option}`);
    // In a real app, this would trigger the authentication flow
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-75 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-card rounded-2xl p-6 w-full max-w-md z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Sign In</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-background rounded-lg transition-colors text-textGrey hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Web2 Options */}
        <div className="space-y-3 mb-6">
          {web2Options.map((option) => (
            <button
              key={option.name}
              onClick={() => handleOptionClick(option.name)}
              className="w-full bg-background hover:bg-opacity-80 text-white py-4 px-4 rounded-xl font-semibold transition-all flex items-center justify-center space-x-3"
            >
              <span className="text-2xl">{option.icon}</span>
              <span>Continue with {option.name}</span>
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-textGrey opacity-30" />
          <span className="px-4 text-textGrey text-sm">OR</span>
          <div className="flex-1 border-t border-textGrey opacity-30" />
        </div>

        {/* Web3 Options */}
        <div className="space-y-3">
          {web3Options.map((option) => (
            <button
              key={option.name}
              onClick={() => handleOptionClick(option.name)}
              className="w-full bg-primary hover:opacity-90 text-white py-4 px-4 rounded-xl font-semibold transition-all flex items-center justify-center space-x-3"
            >
              <span className="text-2xl">{option.icon}</span>
              <span>{option.name}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <p className="text-textGrey text-xs text-center mt-6">
          By connecting, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
