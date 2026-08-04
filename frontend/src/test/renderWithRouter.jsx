import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/** Render a component that uses <Link>/useNavigate/useSearchParams. */
export function renderWithRouter(ui, { route = '/', ...options } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>, options);
}

export default renderWithRouter;
