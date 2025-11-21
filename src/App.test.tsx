import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders DeFi Dashboard title in header', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { level: 1, name: /DeFi Dashboard/i });
  expect(titleElement).toBeInTheDocument();
});

test('renders connect wallet button', () => {
  render(<App />);
  const buttonElement = screen.getByText(/Connect Wallet/i);
  expect(buttonElement).toBeInTheDocument();
});

test('renders welcome message when not connected', () => {
  render(<App />);
  const welcomeElement = screen.getByText(/Welcome to DeFi Dashboard/i);
  expect(welcomeElement).toBeInTheDocument();
});
