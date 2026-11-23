# GoldLedger

Offline Android ledger for a gold business. Customers, instalments, advance, gold conversions, and gallery images stay in SQLite and the app's private documents folder. The app does not use a cloud database, account, or network API.

## Stack

- Expo SDK 58, React Native, JavaScript
- Expo SQLite, Image Picker, File System, Sharing, Document Picker
- React Navigation tabs and stack
- AES-256-GCM backups through `@noble/ciphers`, with PBKDF2-SHA256 keys from `@noble/hashes`

## Precision

Money is stored as integer paise. Gold grams are stored as scaled integers: 1 gram = 10,000 units, which is four decimal places.

Converted grams use half-away-from-zero integer division:

`converted_scaled = round(total_paise * 10000 / rate_paise_per_gram)`

`new_balance = previous_balance - converted_grams`

Negative balances are kept. They mean the business owes gold to the customer. Each conversion stores the rate and the result, so old conversions are never recalculated with a newer rate.

Advance is a separate ledger. It is included in a conversion only when the checkbox is on, and only for the amount entered.

## Run in Expo Go

Install Expo Go for SDK 58. The Play Store build can lag a new SDK. If the phone says the project is incompatible, install the SDK 58 Android build from [expo.dev/go](https://expo.dev/go).

```bash
cd GoldLedger
npm install
npx expo start
```

Scan the QR code with Expo Go. The first launch creates `goldledger.db` on the device. Leave the development machine reachable on the same network.

Check the main flows on a phone:

1. Add a customer with an opening gold balance and an opening advance.
2. Add more than one income payment on the same day.
3. Convert part of the advance and confirm the remaining advance.
4. Switch the theme, force-close the app, and confirm the theme and records are still there.
5. Add a gallery image, swipe between images, and delete one.
6. Create a backup, then restore it only after reading the replacement warning.

This repository was verified with automated calculation and database tests, Expo Doctor, and a JavaScript bundle. It was not installed on a physical phone in this environment.

## Production APK

`eas.json` builds an APK, not an Android App Bundle. The package name is `com.goldledger.app`. No Firebase or Google services file is required.

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

Install the downloaded APK. Gallery files and the database remain in the app's private storage.

## Tests

```bash
npm test
```

The suite covers the conversion examples, partial advance, duplicate conversion rejection, rollback, customer search, gallery isolation, theme and PIN hashing, report date filters, and encrypted backup restore. It uses Node's built-in SQLite so the same SQL runs without a device.

## Project layout

`src/database` opens SQLite and runs migrations. `src/services` owns the SQL. Screens call services and do not assemble queries. `src/utils/goldCalculations.js` is the decimal-safe calculation module.
