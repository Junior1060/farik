import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProtectedImage from '../ProtectedImage';

const { mockFetch, mockOpen } = vi.hoisted(() => ({ mockFetch: vi.fn(), mockOpen: vi.fn() }));
vi.mock('../../../services/api', () => ({
  fetchProtectedFile: mockFetch,
  openProtectedFile: mockOpen,
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockOpen.mockReset();
  mockOpen.mockResolvedValue(undefined);
});

describe('ProtectedImage', () => {
  it('fetches the file through the session instead of a bare <img src>, then renders it', async () => {
    mockFetch.mockResolvedValue('blob:photo-1');
    render(<ProtectedImage src="/uploads/maintenance/a.jpg" alt="Photo 1" className="w-16 h-16" />);

    expect(mockFetch).toHaveBeenCalledWith('/uploads/maintenance/a.jpg');
    const img = await screen.findByRole('img', { name: 'Photo 1' });
    expect(img).toHaveAttribute('src', 'blob:photo-1');
    expect(img).toHaveClass('w-16', 'h-16');
  });

  it('opens the full-size file on click, again through the session', async () => {
    mockFetch.mockResolvedValue('blob:photo-1');
    render(<ProtectedImage src="/uploads/maintenance/a.jpg" alt="Photo 1" />);

    fireEvent.click(await screen.findByRole('button', { name: /photo 1/i }));
    expect(mockOpen).toHaveBeenCalledWith('/uploads/maintenance/a.jpg');
  });

  it('shows a placeholder, not a broken image, when the file cannot be loaded', async () => {
    mockFetch.mockRejectedValue({ response: { status: 404 } });
    render(<ProtectedImage src="/uploads/maintenance/gone.jpg" alt="Photo 2" />);

    const placeholder = await screen.findByRole('img', { name: 'Photo 2' });
    expect(placeholder).toHaveTextContent('Unavailable');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
