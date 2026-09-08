type TransferStatus = "pending" | "confirmed" | "refunded";

interface TransferCardProps {
  amount: string;
  memo: string;
  status: TransferStatus;
  onClick: () => void;
}

const statusLabel: Record<TransferStatus, string> = { pending: "待确认", confirmed: "已收款", refunded: "已退回" };

export function TransferCard({ amount, memo, status, onClick }: TransferCardProps) {
  return (
    <button type="button" onClick={onClick} className="chat-message--payment chat-message--transfer special-payment-card transfer-card cv-transfer" data-status={status} title="查看转账">
      <div className="special-payment-card__top"><span className="special-payment-card__title">转账</span><span className="special-payment-card__status">{statusLabel[status]}</span></div>
      <div className="special-payment-card__money">¥{amount}</div>
      <div className="special-payment-card__note">{memo}</div>
      <span className="special-payment-card__brand">Pay</span>
    </button>
  );
}
