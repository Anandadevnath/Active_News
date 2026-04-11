import java.util.HashMap;
import java.util.Map;

public class Bank {
    private String bankName;
    private Map<String, BankAccount> accounts;
    private int accountCounter;

    public Bank(String bankName) {
        this.bankName = bankName;
        this.accounts = new HashMap<>();
        this.accountCounter = 1000;
    }

    // Create a new account
    public BankAccount createAccount(Customer customer, double initialBalance, String accountType) {
        accountCounter++;
        String accountNumber = "ACC" + accountCounter;
        BankAccount account = new BankAccount(accountNumber, customer, initialBalance, accountType);
        accounts.put(accountNumber, account);
        System.out.println("✅ Account created successfully!");
        System.out.println("Account Number: " + accountNumber);
        return account;
    }

    // Get account by account number
    public BankAccount getAccount(String accountNumber) {
        if (!accounts.containsKey(accountNumber)) {
            System.out.println("❌ Account not found!");
            return null;
        }
        return accounts.get(accountNumber);
    }

    // Delete account
    public boolean deleteAccount(String accountNumber) {
        if (!accounts.containsKey(accountNumber)) {
            System.out.println("❌ Account not found!");
            return false;
        }
        BankAccount account = accounts.get(accountNumber);
        if (account.getBalance() != 0) {
            System.out.println("❌ Cannot delete account with non-zero balance!");
            return false;
        }
        accounts.remove(accountNumber);
        System.out.println("✅ Account deleted successfully!");
        return true;
    }

    // Display all accounts
    public void displayAllAccounts() {
        if (accounts.isEmpty()) {
            System.out.println("📋 No accounts found.");
            return;
        }
        System.out.println("\n========== ALL ACCOUNTS IN " + bankName + " ==========");
        for (BankAccount account : accounts.values()) {
            System.out.println("Account: " + account.getAccountNumber() + " | Customer: " + 
                             account.getCustomer().getName() + " | Balance: $" + 
                             String.format("%.2f", account.getBalance()) + " | Type: " + 
                             account.getAccountType());
        }
        System.out.println("=============================================\n");
    }

    // Get total balance in bank
    public double getTotalBalance() {
        double total = 0;
        for (BankAccount account : accounts.values()) {
            total += account.getBalance();
        }
        return total;
    }

    // Get number of accounts
    public int getAccountCount() {
        return accounts.size();
    }

    public String getBankName() {
        return bankName;
    }
}
