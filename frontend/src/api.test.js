import {
  getStoredPassword,
  storePassword,
  clearStoredPassword,
  hasStoredPassword,
} from './api';

// These cover the stored-password helpers rather than the logout button itself.
// The button is three lines of JSX with no logic in it; the decision worth
// pinning is hasStoredPassword(), which is what says whether it appears at all,
// and getting that wrong either hides logout from someone who needs it or
// advertises a lock on a site that has none.
//
// logOut() is not covered here: the half worth testing is the clear, which is
// clearStoredPassword() below, and the other half is window.location.reload(),
// which jsdom does not implement and which is not worth a brittle stub.

describe('the stored password', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('an empty browser is holding nothing', () => {
    expect(hasStoredPassword()).toBe(false);
  });

  test('a stored password is held', () => {
    storePassword('hunter2');

    expect(hasStoredPassword()).toBe(true);
    expect(getStoredPassword()).toBe('hunter2');
  });

  test('clearing it leaves nothing behind', () => {
    storePassword('hunter2');
    clearStoredPassword();

    expect(hasStoredPassword()).toBe(false);
    expect(getStoredPassword()).toBe('');
  });

  test('a missing password reads as empty rather than null', () => {
    // It goes straight into a header, where a literal "null" would be sent as
    // the password and rejected in a way that looks like a wrong password.
    expect(getStoredPassword()).toBe('');
    expect(getStoredPassword()).not.toBeNull();
  });

  test('an empty string does not count as holding a password', () => {
    // The 401 path clears the key, but a blank submitted through any other
    // route must not light up a logout button that logs out of nothing.
    storePassword('');

    expect(hasStoredPassword()).toBe(false);
  });
});
