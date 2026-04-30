import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return <div className={cn('card', className)}>{children}</div>
}

interface CardHeadProps {
  children: React.ReactNode
  className?: string
}

export function CardHead({ children, className }: CardHeadProps) {
  return <div className={cn('card-head', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card-title', className)}>{children}</div>
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card-body', className)}>{children}</div>
}
