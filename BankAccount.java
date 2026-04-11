import java.util.ArrayList;
import java.util.List;

public class BankAccount {
    private String accountNumber;
    private Customer customer;
    private double balance;
    private String accountType;
    private List<Transaction> transactions;

    public BankAccount(String accountNumber, Customer customer, double initialBalance, String accountType) {
        this.accountNumber = accountNumber;
        this.customer = customer;
        this.balance = initialBalance;
        this.accountType = accountType;
        this.transactions = new ArrayList<>();
        
        if (initialBalance > 0) {
            Transaction initialDeposit = new Transaction("TXN001", "Initial Deposit", initialBalance, balance);
            transactions.add(initialDeposit);
        }
    }

    // Deposit money
    public boolean deposit(double amount) {
        if (amount <= 0) {
            System.out.println("❌ Deposit amount must be positive!");
            return false;
        }
        balance += amount;
        String transactionId = "TXN" + (transactions.size() + 1);
        Transaction transaction = new Transaction(transactionId, "Deposit", amount, balance);
        transactions.add(transaction);
        System.out.println("✅ Deposit successful! New Balance: $" + balance);
        return true;
    }

    // Withdraw money
    public boolean withdraw(double amount) {
        if (amount <= 0) {
            System.out.println("❌ Withdrawal amount must be positive!");
            return false;
        }
        if (amount > balance) {
            System.out.println("❌ Insufficient balance! Current Balance: $" + balance);
            return false;
        }
        balance -= amount;
        String transactionId = "TXN" + (transactions.size() + 1);
        Transaction transaction = new Transaction(transactionId, "Withdrawal", amount, balance);
        transactions.add(transaction);
        System.out.println("✅ Withdrawal successful! New Balance: $" + balance);
        return true;
    }

    // Transfer money to another account
    public boolean transfer(BankAccount recipient, double amount) {
        if (amount <= 0) {
            System.out.println("❌ Transfer amount must be positive!");
            return false;
        }
        if (amount > balance) {
            System.out.println("❌ Insufficient balance for transfer!");
            return false;
        }
        
        this.balance -= amount;
        recipient.balance += amount;
        
        String transactionId = "TXN" + (transactions.size() + 1);
        Transaction senderTransaction = new Transaction(transactionId, "Transfer OUT to " + recipient.accountNumber, amount, balance);
        transactions.add(senderTransaction);
        
        Transaction recipientTransaction = new Transaction(transactionId, "Transfer IN from " + accountNumber, amount, recipient.balance);
        recipient.transactions.add(recipientTransaction);
        
        System.out.println("✅ Transfer successful!");
        return true;
    }

    // Check balance
    public double getBalance() {
        return balance;
    }

    // View transaction history
    public void printTransactionHistory() {
        if (transactions.isEmpty()) {
            System.out.println("📋 No transactions found.");
            return;
        }
        System.out.println("\n========== TRANSACTION HISTORY ==========");
        for (Transaction transaction : transactions) {
            System.out.println(transaction);
        }
        System.out.println("=========================================\n");
    }

    // Display account details
    public void displayAccountDetails() {
        System.out.println("\n========== ACCOUNT DETAILS ==========");
        System.out.println("Account Number: " + accountNumber);
        System.out.println("Account Type: " + accountType);
        System.out.println("Customer: " + customer.getName());
        System.out.println("Current Balance: $" + String.format("%.2f", balance));
        System.out.println("Total Transactions: " + transactions.size());
        System.out.println("=====================================\n");
    }

    // Getters
    public String getAccountNumber() {
        return accountNumber;
    }

    public Customer getCustomer() {
        return customer;
    }

    public String getAccountType() {
        return accountType;
    }

    public List<Transaction> getTransactions() {
        return transactions;
    }
}
