import { guessSms, isPlausibleSms, isTransfer } from '../src/app/lib/smsParser';

const cases: {
  name: string;
  sms: string;
  expect: Partial<{ payee: string; direction: string; transfer: boolean; amount: string; plausible: boolean }>;
}[] = [
  {
    name: 'Amazon purchase is not a transfer',
    sms: 'Purchase of AED 156.82 with Credit Card ending 3582 at Amazon.ae, Dubai. Avl Cr. Limit is AED 26,362.52',
    expect: { payee: 'Amazon.ae', direction: 'outflow', transfer: false, amount: '156.82', plausible: true },
  },
  {
    name: 'STARZPLAY refund is inflow',
    sms: 'Purchase amount of AED 4.00 at STARZPLAY.COM on your Debit Card ending 6613 has been refunded to your card account. Avl Bal is AED 978.56.',
    expect: { payee: 'STARZPLAY.COM', direction: 'inflow', transfer: false, amount: '4.00', plausible: true },
  },
  {
    name: 'Real transfer to account',
    sms: 'AED 500.00 has been transferred to your account XX1234 from JOHN DOE. Avl Bal is AED 1,200.00.',
    expect: { payee: 'Transfer', direction: 'inflow', transfer: true, amount: '500.00', plausible: true },
  },
  {
    name: 'Dummy clipboard text is not plausible',
    sms: 'No, Vercel does not currently support f',
    expect: { payee: '', amount: '', plausible: false },
  },
];

let failed = 0;
for (const test of cases) {
  const transfer = isTransfer(test.sms);
  const guess = guessSms(test.sms);
  const actual = {
    payee: guess.fields.payee,
    direction: guess.fields.direction,
    transfer,
    amount: guess.fields.amount,
    plausible: isPlausibleSms(test.sms, guess),
  };
  const mismatches = Object.entries(test.expect).filter(
    ([key, value]) => actual[key as keyof typeof actual] !== value,
  );
  if (mismatches.length) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    for (const [key, value] of mismatches) {
      console.error(
        `  ${key}: got ${JSON.stringify(actual[key as keyof typeof actual])} expected ${JSON.stringify(value)}`,
      );
    }
  } else {
    console.log(`ok  ${test.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
