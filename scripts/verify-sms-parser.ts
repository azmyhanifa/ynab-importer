import {
  compileTemplate,
  guessSms,
  isAccountCredit,
  isPlausibleSms,
  isTransfer,
  matchTemplate,
} from '../src/app/lib/smsParser';

const SALARY_SMS =
  'Salary of AED 12,500.00 has been credited into your account 101XXX12XXX34. The available balance is AED 40,000.00.';

const cases: {
  name: string;
  sms: string;
  expect: Partial<{
    payee: string;
    direction: string;
    transfer: boolean;
    amount: string;
    last4: string;
    plausible: boolean;
    accountCredit: boolean;
    ignoredCount: number;
  }>;
}[] = [
  {
    name: 'Amazon purchase is not a transfer',
    sms: 'Purchase of AED 156.82 with Credit Card ending 4242 at Amazon.ae, Dubai. Avl Cr. Limit is AED 8,000.00',
    expect: { payee: 'Amazon.ae', direction: 'outflow', transfer: false, amount: '156.82', last4: '4242', plausible: true },
  },
  {
    name: 'STARZPLAY refund is inflow',
    sms: 'Purchase amount of AED 4.00 at STARZPLAY.COM on your Debit Card ending 1111 has been refunded to your card account. Avl Bal is AED 900.00.',
    expect: { payee: 'STARZPLAY.COM', direction: 'inflow', transfer: false, amount: '4.00', last4: '1111', plausible: true },
  },
  {
    name: 'Real transfer to account',
    sms: 'AED 500.00 has been transferred to your account XX1234 from JOHN DOE. Avl Bal is AED 1,200.00.',
    expect: { payee: 'Transfer', direction: 'inflow', transfer: true, amount: '500.00', last4: '1234', plausible: true },
  },
  {
    name: 'Salary credited into masked account',
    sms: SALARY_SMS,
    expect: {
      payee: 'Salary',
      direction: 'inflow',
      transfer: false,
      amount: '12500.00',
      last4: '1234',
      plausible: true,
      accountCredit: true,
      ignoredCount: 1,
    },
  },
  {
    name: 'Credit into masked account without Salary of',
    sms: 'AED 1,250.00 has been credited into your account 101XXX12XXX34. The available balance is AED 12,000.00.',
    expect: {
      payee: '',
      direction: 'inflow',
      transfer: false,
      amount: '1250.00',
      last4: '1234',
      plausible: true,
      accountCredit: true,
    },
  },
  {
    name: 'Credit into account without last4 still plausible',
    sms: 'AED 500.00 has been credited into your account. The available balance is AED 1,200.00.',
    expect: {
      payee: '',
      direction: 'inflow',
      transfer: false,
      amount: '500.00',
      last4: '',
      plausible: true,
      accountCredit: true,
    },
  },
  {
    name: 'Random amount text is not a bank SMS',
    sms: 'The price is AED 12,500.00 for the sofa.',
    expect: { payee: '', last4: '', plausible: false, accountCredit: false },
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
    last4: guess.fields.last4,
    plausible: isPlausibleSms(test.sms, guess),
    accountCredit: isAccountCredit(test.sms),
    ignoredCount: guess.highlights.filter(h => h.field === 'ignored').length,
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

{
  const name = 'Learned salary template keeps masked account last4';
  const guess = guessSms(SALARY_SMS);
  const tpl = compileTemplate(SALARY_SMS, guess.fields);
  const next =
    'Salary of AED 10,000.00 has been credited into your account 101XXX99XXX88. The available balance is AED 50.00.';
  const matched = matchTemplate(next, [tpl]);
  const actual = {
    amount: matched?.fields.amount,
    last4: matched?.fields.last4,
    payee: matched?.fields.payee,
    direction: matched?.fields.direction,
  };
  const expect = { amount: '10000.00', last4: '9988', payee: 'Salary', direction: 'inflow' };
  const mismatches = Object.entries(expect).filter(
    ([key, value]) => actual[key as keyof typeof actual] !== value,
  );
  if (!matched || mismatches.length) {
    failed += 1;
    console.error(`FAIL ${name}`);
    if (!matched) console.error('  no template match');
    for (const [key, value] of mismatches) {
      console.error(`  ${key}: got ${JSON.stringify(actual[key as keyof typeof actual])} expected ${JSON.stringify(value)}`);
    }
  } else {
    console.log(`ok  ${name}`);
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
