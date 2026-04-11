import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Transaction {
    private String transactionId;
    private String transactionType;
    private double amount;
    private LocalDateTime timestamp;
    private double balanceAfter;

    public Transaction(String transactionId, String transactionType, double amount, double balanceAfter) {
        this.transactionId = transactionId;
        this.transactionType = transactionType;
        this.amount = amount;
        this.timestamp = LocalDateTime.now();
        this.balanceAfter = balanceAfter;
    }

    // Getters
    public String getTransactionId() {
        return transactionId;
    }

    public String getTransactionType() {
        return transactionType;
    }

    public double getAmount() {
        return amount;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public double getBalanceAfter() {
        return balanceAfter;
    }

    @Override
    public String toString() {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        return String.format("ID: %s | Type: %s | Amount: $%.2f | Balance: $%.2f | Time: %s",
                transactionId, transactionType, amount, balanceAfter, timestamp.format(formatter));
    }
}
