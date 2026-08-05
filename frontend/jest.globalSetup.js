/**
 * Pins the test suite's timezone, before anything can read it.
 *
 * Date handling has a whole class of bug that is invisible at UTC+0: a value
 * that shifts by a couple of hours still lands on the same calendar day, so a
 * suite running at UTC is testing the one offset where these functions cannot
 * be wrong. Birthdates were being stored a day early in Norway for exactly this
 * reason, under a green suite.
 *
 * This has to run here rather than in a setup file. jsdom reads the timezone
 * once, when it builds the context each worker runs in, and a later
 * `process.env.TZ = ...` does not reach it — that was tried, and the tests went
 * on reporting UTC. globalSetup runs in the parent process before any worker is
 * forked, so the workers inherit an environment that already says Oslo, and
 * their jsdom contexts are built from it.
 *
 * Setting it here rather than in the `test` script also means it holds however
 * jest is started: an IDE runner, a bare `npx react-scripts test`, or a shell
 * that does not understand `VAR=value command` all get the pin.
 */
module.exports = () => {
  process.env.TZ = 'Europe/Oslo';
};
