import java.util.Scanner;

class Main {
    private static Bank bank;
    private static Scanner scanner;
    private static BankAccount currentAccount;

    public static void main(String[] args) {
        scanner = new Scanner(System.in);
        bank = new Bank("MyBank");

        boolean running = true;
        while (running) {
            displayMainMenu();
            System.out.print("Enter your choice: ");
            String choice = scanner.nextLine().trim();

            switch (choice) {
                case "1":
                    createNewAccount();
                    break;
                case "2":
                    selectAccount();
                    break;
                case "3":
                    if (currentAccount != null) {
                        accountMenu();
                    } else {
                        System.out.println("❌ Please select an account first!");
                    }
                    break;
                case "4":
                    bank.displayAllAccounts();
                    break;
                case "5":
                    displayBankInfo();
                    break;
                case "6":
                    running = false;
                    System.out.println("👋 Thank you for using MyBank. Goodbye!");
                    break;
                case "7":
                    clearScreen();
                    break;
                default:
                    System.out.println("❌ Invalid choice! Please try again.");
            }
        }
        scanner.close();
    }

    private static void clearScreen() {
        System.out.print("\033[H\033[2J");
        System.out.flush();
    }

    private static void displayMainMenu() {
        clearScreen();
        System.out.println("\n╔════════════════════════════════════╗");
        System.out.println("║      WELCOME TO MYBANK SYSTEM    ║");
        System.out.println("╚════════════════════════════════════╝");
        System.out.println("1. Create New Account");
        System.out.println("2. Select Account");
        System.out.println("3. Access Account");
        System.out.println("4. View All Accounts");
        System.out.println("5. Bank Information");
        System.out.println("6. Exit");
        System.out.println("7. Clear Screen");
        System.out.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    private static void createNewAccount() {
        clearScreen();
        System.out.println("\n========== CREATE NEW ACCOUNT ==========");
        System.out.print("Enter Customer ID: ");
        String customerId = scanner.nextLine().trim();

        System.out.print("Enter Customer Name: ");
        String name = scanner.nextLine().trim();

        System.out.print("Enter Email: ");
        String email = scanner.nextLine().trim();

        System.out.print("Enter Phone Number: ");
        String phoneNumber = scanner.nextLine().trim();

        System.out.print("Enter Initial Balance: $");
        double initialBalance;
        try {
            initialBalance = Double.parseDouble(scanner.nextLine().trim());
        } catch (NumberFormatException e) {
            System.out.println("❌ Invalid amount!");
            return;
        }

        System.out.println("Select Account Type:");
        System.out.println("1. Savings");
        System.out.println("2. Checking");
        System.out.println("3. Business");
        System.out.print("Enter choice: ");
        String accountTypeChoice = scanner.nextLine().trim();

        String accountType;
        switch (accountTypeChoice) {
            case "1":
                accountType = "Savings";
                break;
            case "2":
                accountType = "Checking";
                break;
            case "3":
                accountType = "Business";
                break;
            default:
                System.out.println("❌ Invalid choice!");
                return;
        }

        Customer customer = new Customer(customerId, name, email, phoneNumber);
        BankAccount account = bank.createAccount(customer, initialBalance, accountType);
        currentAccount = account;
        System.out.println("=========================================");
    }

    private static void selectAccount() {
        clearScreen();
        System.out.println("\n========== SELECT ACCOUNT ==========");
        System.out.print("Enter Account Number: ");
        String accountNumber = scanner.nextLine().trim();

        BankAccount account = bank.getAccount(accountNumber);
        if (account != null) {
            currentAccount = account;
            System.out.println("✅ Account selected!");
            account.displayAccountDetails();
        }
    }

    private static void accountMenu() {
        boolean inAccount = true;
        while (inAccount) {
            clearScreen();
            System.out.println("\n========== ACCOUNT MENU ==========");
            System.out.println("Current Account: " + currentAccount.getAccountNumber());
            System.out.println("Balance: $" + String.format("%.2f", currentAccount.getBalance()));
            System.out.println("1. Deposit Money");
            System.out.println("2. Withdraw Money");
            System.out.println("3. Transfer Money");
            System.out.println("4. View Balance");
            System.out.println("5. View Transaction History");
            System.out.println("6. View Account Details");
            System.out.println("7. Back to Main Menu");
            System.out.print("Enter your choice: ");
            String choice = scanner.nextLine().trim();

            switch (choice) {
                case "1":
                    deposit();
                    break;
                case "2":
                    withdraw();
                    break;
                case "3":
                    transfer();
                    break;
                case "4":
                    System.out.println("\n💰 Current Balance: $" + 
                                     String.format("%.2f", currentAccount.getBalance()));
                    break;
                case "5":
                    currentAccount.printTransactionHistory();
                    break;
                case "6":
                    currentAccount.displayAccountDetails();
                    break;
                case "7":
                    inAccount = false;
                    break;
                default:
                    System.out.println("❌ Invalid choice!");
            }
        }
    }

    private static void deposit() {
        System.out.print("Enter amount to deposit: $");
        try {
            double amount = Double.parseDouble(scanner.nextLine().trim());
            currentAccount.deposit(amount);
        } catch (NumberFormatException e) {
            System.out.println("❌ Invalid amount!");
        }
    }

    private static void withdraw() {
        System.out.print("Enter amount to withdraw: $");
        try {
            double amount = Double.parseDouble(scanner.nextLine().trim());
            currentAccount.withdraw(amount);
        } catch (NumberFormatException e) {
            System.out.println("❌ Invalid amount!");
        }
    }

    private static void transfer() {
        System.out.print("Enter recipient account number: ");
        String recipientAccountNumber = scanner.nextLine().trim();

        BankAccount recipient = bank.getAccount(recipientAccountNumber);
        if (recipient == null) {
            return;
        }

        System.out.print("Enter transfer amount: $");
        try {
            double amount = Double.parseDouble(scanner.nextLine().trim());
            currentAccount.transfer(recipient, amount);
        } catch (NumberFormatException e) {
            System.out.println("❌ Invalid amount!");
        }
    }

    private static void displayBankInfo() {
        clearScreen();
        System.out.println("\n========== BANK INFORMATION ==========");
        System.out.println("Bank Name: " + bank.getBankName());
        System.out.println("Total Accounts: " + bank.getAccountCount());
        System.out.println("Total Balance: $" + String.format("%.2f", bank.getTotalBalance()));
        System.out.println("=====================================");
    }

}

