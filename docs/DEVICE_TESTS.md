# Physical-device acceptance checklist

These checks require the user's Android and iPhone. Automated tests cannot certify native camera/layout behavior. Record device model, OS, Expo Go version, date, and failures.

## Accounts and layout

- [ ] Both phones open `/health` and run the project in SDK-compatible Expo Go.
- [ ] On a clean install/browser profile, Terms & Conditions block every normal screen; Accept stays disabled until the document end.
- [ ] Decline shows the polite decision screen, survives a full close/reopen, and Review Terms & Conditions returns to the document without entering the app.
- [ ] Accept survives a full close/reopen; an older stored version requires acceptance again; Settings → Terms & Conditions opens the same document without prompting.
- [ ] Screens respect safe areas and large fonts; forms remain usable with the keyboard open.
- [ ] Register requires legal-age self-attestation; duplicate usernames and wrong passwords show errors.
- [ ] On the deployed web app, register or log in, reload and close/reopen the page, and confirm the session restores; then log out and confirm it does not return.
- [ ] Session restoration and sign-out work; temporary network failures do not erase valid sessions.
- [ ] Profile-photo selection works; denied photo permission shows useful guidance.
- [ ] The verified daily celebration card fits below Tonight on small iPhone, Android, and production web layouts without clipping or pushing primary actions below reach.
- [ ] The card shows `I was not going to drink today, but...`, the Lisbon date, and the celebration title and fact without a source link. Tapping the card leaves Tonight open. With the optional provider unavailable, a fixed-date celebration still appears. Return to the app after Lisbon midnight and verify that the new date's card appears.

## Shared competition

- [ ] Creating a night requires choosing Classic or Party before the invitation code is generated.
- [ ] Classic keeps drink-only scoring and does not show the Party tab.
- [ ] Party cannot start with only the host; with two players, the host can start and both devices receive the first challenge.
- [ ] A Party challenge shows the same countdown on both devices and changes automatically after 30 minutes.
- [ ] Each player can submit one rear-photo/selfie pair per challenge; majority approval adds two points to the main leaderboard and the approved pair appears in the feed.
- [ ] A creates an event; B joins using its shared code; both start at zero.
- [ ] Joining twice does not duplicate membership; joining late works before closure.
- [ ] Rear capture switches to front capture; preview images have the correct orientation.
- [ ] Retake replaces both photos; competition capture offers no gallery picker.
- [ ] Camera denial and subsequent permission changes recover correctly.
- [ ] Each pair adds one point and appears in both feeds; ties share a rank.
- [ ] Rank transitions animate; reduced-motion settings disable them.
- [ ] Only the host can finish; confirmation precedes closure.
- [ ] Closure prevents further scoring, and final rank groups include ties.
- [ ] History retains final standings and photos; feed pagination works.

## Failures and recovery

- [ ] Disconnect after preview, submit, reconnect, and retry without duplicate scoring.
- [ ] Close/reopen the camera after a failed upload; the pending pair remains.
- [ ] Background/resume both phones; standings and photo links refresh.
- [ ] Disconnect/reconnect on the event screen; live status and polling recover.
- [ ] End on A while B previews; B's submission is rejected without a point.
- [ ] Submit after access-token expiry; refresh rotation is transparent.
- [ ] Test Android back behavior, screen-reader labels, empty states, and loading states.
