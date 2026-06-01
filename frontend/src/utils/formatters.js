import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

export const formatDate = (date) => format(new Date(date), 'MMM d, yyyy');

export const formatDateShort = (date) => format(new Date(date), 'MM/dd/yyyy');

export const formatRelative = (date) => formatDistanceToNow(new Date(date), { addSuffix: true });

export const formatDateTime = (date) => format(new Date(date), 'MMM d, yyyy h:mm a');

export const daysUntil = (date) => differenceInDays(new Date(date), new Date());

export const daysUntilLabel = (date) => {
  const days = daysUntil(date);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

export const getInitials = (firstName, lastName) =>
  `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

export const fullName = (profile) =>
  profile ? `${profile.firstName} ${profile.lastName}` : 'Unknown';
