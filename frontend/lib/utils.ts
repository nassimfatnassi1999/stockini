import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'DT') {
  return `${amount.toLocaleString('fr-TN', { minimumFractionDigits: 3 })} ${currency}`
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-TN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date))
}

export function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
