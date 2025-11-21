import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dashboard with portfolio value', () => {
  render(<App />);
  const portfolioElement = screen.getByText(/Total Portfolio Value/i);
  expect(portfolioElement).toBeInTheDocument();
});

test('renders get started button', () => {
  render(<App />);
  const buttonElement = screen.getByText(/Get Started/i);
  expect(buttonElement).toBeInTheDocument();
});

test('renders markets section', () => {
  render(<App />);
  const marketsElement = screen.getByText(/Markets/i);
  expect(marketsElement).toBeInTheDocument();
});
