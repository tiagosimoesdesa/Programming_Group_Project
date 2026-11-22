export const TERMS_VERSION = "1.0";
export const TERMS_EFFECTIVE_DATE = "22 November 2026";

export type LegalSection = {
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export const TERMS_INTRO =
  "These Terms govern access to and use of COUNT THE JOLS. Please read them completely before deciding whether to use the app.";

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    title: "1. About these Terms and the operator",
    paragraphs: [
      "COUNT THE JOLS is currently a student project. The legal identity, service address and contact details of the person or entity that operates the service must be inserted before public release. In these Terms, “we”, “us” and “the operator” refer to that person or entity once identified.",
      "By selecting Accept, you ask us to provide the service described below and agree to these Terms. If you do not agree, select Decline. You will not be able to enter or use the app unless you accept the current version.",
      "Acceptance of these Terms forms the service agreement. It is not consent to optional personal-data processing, marketing, analytics or permissions. Where consent is legally required, it must be requested separately, for a specific purpose, and remain withdrawable without changing the lawfulness of earlier processing.",
    ],
  },
  {
    title: "2. Eligibility and legal drinking age",
    paragraphs: [
      "The app is intended only for people who are legally permitted to consume alcohol where they are located. Registration currently relies on your self-attestation that you meet the applicable legal drinking age; it does not verify identity or age. In Portugal, providing, selling or commercially making alcoholic drinks available to minors in public places or places open to the public is prohibited under the applicable alcohol legislation.",
      "Do not use the app if you are under the applicable age, are prohibited from drinking, or cannot enter into these Terms. The operator may introduce stronger age checks where required by law or distribution rules.",
    ],
  },
  {
    title: "3. Responsible use and health",
    paragraphs: [
      "COUNT THE JOLS records user-confirmed drinks for a private social game. It does not sell, supply or deliver alcohol, and it is not designed to encourage drinking, intoxication, rapid consumption or competition that puts health or safety at risk.",
      "Scores are entertainment only. They are not a measure of fitness, capacity, sobriety or safe consumption. The app does not verify what a photograph contains, who owns a drink, whether it was consumed, or whether it was previously counted. It does not provide medical advice or calculate blood-alcohol concentration.",
    ],
    bullets: [
      "Respect your limits and never feel pressure to keep up with another player or team.",
      "Drink water, eat appropriately, look after friends and stop participating if you feel unwell.",
      "Never drink and drive, cycle, operate machinery or undertake another unsafe activity.",
      "Do not use the app to pressure, shame or reward excessive consumption. Seek professional or emergency help when needed.",
    ],
  },
  {
    title: "4. Accounts and security",
    paragraphs: [
      "You register with a username, password and legal-age attestation. Usernames are visible to members of nights you join. Choose a username that does not reveal information you do not want to share. You are responsible for keeping your password and device secure and for activity performed through your session.",
      "Do not impersonate another person, share access tokens, attempt to access another account, or choose a username that is unlawful, abusive or infringes another person’s rights. Tell the operator promptly if you believe an account or session has been compromised. Password recovery and account deletion are not currently available in the app.",
    ],
  },
  {
    title: "5. How the service works",
    paragraphs: [
      "A host creates an invitation-only night and shares player or spectator codes. Players can submit a rear photograph and a selfie, confirm regular-beer and pint quantities, receive Jols, appear in standings and react to photographs. Classic, Party and Battle modes apply the rules displayed in the app. Party can include timed photo challenges and votes. Battle uses two teams, a host-selected duration and optional temporary concealment of the opposing team’s scores and photographs.",
      "Scoring, timers, roles, visibility and permissions are enforced by the backend. Check-ins are trust-based. Hosts and other participants must not treat a score as independently verified. The operator may correct technical defects, but does not promise to resolve social disagreements about a photograph or declared quantity.",
      "A member may hide or remove a finished night from their personal history. Removal from one person’s history does not delete the night, photographs or results for other members.",
    ],
  },
  {
    title: "6. Photographs, other people and private groups",
    paragraphs: [
      "You remain responsible for every photograph, name, reaction and other content you submit. Only upload content you are entitled to use. Obtain the informed agreement of every identifiable person shown, especially for group challenges, and respect anyone who asks not to be photographed or to have a photograph removed.",
      "Night content is not public by design, but it is shared with the people who enter that night. Invited spectators can view and react to photographs. During a private-score Battle, opposing teams’ content is hidden only until the Battle ends; it is then revealed. Other participants may take screenshots or otherwise copy content outside our control, so do not upload anything you would be unsafe or seriously uncomfortable sharing with the invited group.",
      "Do not submit illegal, threatening, discriminatory, sexually exploitative, violent, privacy-invasive or intellectual-property-infringing content, or content that exposes credentials, financial data, identity documents, health data or another person’s private information. Do not use the app for harassment or non-consensual monitoring.",
    ],
  },
  {
    title: "7. Limited permission for user content",
    paragraphs: [
      "You retain any rights you hold in content you submit. You grant the operator a non-exclusive, worldwide, royalty-free permission, for as long as the content is stored for the service, to host, copy, re-encode, transmit and display it only as needed to operate, secure, maintain and provide the relevant app features. This permission does not authorise advertising or sale of your photographs.",
      "You confirm that granting this limited permission does not violate another person’s rights. Mandatory data-protection and privacy rights continue to apply independently of this licence.",
    ],
  },
  {
    title: "8. Acceptable use",
    bullets: [
      "Do not bypass authentication, invitation codes, hidden-team rules, rate limits or other access controls.",
      "Do not scrape, probe, overload, reverse engineer for abuse, distribute malware, automate fake activity or interfere with the API, storage, database or another person’s session.",
      "Do not manipulate scores through duplicate, misleading or unauthorised submissions.",
      "Do not use the service for unlawful promotion, sale or supply of alcohol or for any commercial activity not authorised by the operator.",
    ],
    paragraphs: [
      "Access may be restricted where reasonably necessary to protect people, investigate abuse, comply with law or keep the service secure. A formal in-app reporting and appeal process has not yet been implemented and must be established before broader public launch.",
    ],
  },
  {
    title: "9. Personal data and privacy",
    paragraphs: [
      "The app processes account, session, age-attestation, profile, night-membership, photograph, scoring, reaction, challenge, device-permission and limited security data to provide and protect the service. The Privacy notice in Settings describes the current implementation, recipients, legal bases, gaps and rights in more detail.",
      "Core processing needed to create an account and participate in nights is expected to rely on performance of the service agreement. Security and reliability processing may rely on legitimate interests, subject to the required balancing assessment. Legal obligations may also apply. Optional processing that requires consent must use a separate choice; accepting these Terms is not that consent.",
      "The current code uses Render for hosting and Supabase for PostgreSQL and private photo storage. OpenAI may prepare a daily public celebration fact from a date and a non-user-specific prompt; the code does not send account or night content for that feature. Provider regions, transfer safeguards, retention and the operator’s processor arrangements must be confirmed before publication.",
    ],
  },
  {
    title: "10. Local storage, sessions and acceptance record",
    paragraphs: [
      "The app stores the accepted Terms version and acceptance time on the device or browser so it can remember the decision without adding it to your profile. A declined state is also stored locally so the app remains blocked while preserving a route back to review. This strictly functional record is not used for advertising or analytics.",
      "Native sessions use secure device storage. Browser sessions use a first-party, secure, HttpOnly refresh cookie that JavaScript cannot read, while the access token remains in memory. Clearing app/browser storage, reinstalling, or changing device may require acceptance and sign-in again.",
    ],
  },
  {
    title: "11. Service providers and availability",
    paragraphs: [
      "The service depends on internet access and third-party infrastructure, including Render and Supabase. Those services have their own terms and privacy practices. Their availability and security are outside the app’s control.",
      "The service is currently an early student release and may be changed, suspended, unavailable or discontinued. Free hosting may sleep and take time to wake. We do not guarantee uninterrupted operation, permanent storage, compatibility with every device, or that every notification, timer, photograph or score will always be available without delay or error.",
    ],
  },
  {
    title: "12. Intellectual property",
    paragraphs: [
      "Except for user content and third-party materials, the app’s software, interface, branding and original content are protected to the extent provided by applicable law. Acceptance gives you a limited, personal, revocable and non-transferable right to use the service for its intended non-commercial purpose; it does not transfer ownership or grant a right to reproduce branding or distribute a modified service.",
      "The repository currently contains no project-wide licence or verified rights-holder notice. Ownership, third-party licences and permissions for names, logos, beer imagery and other assets must be confirmed before public release.",
    ],
  },
  {
    title: "13. Liability and mandatory rights",
    paragraphs: [
      "You remain responsible for decisions to drink, quantities consumed, travel, photographs, invitations and interactions with other participants. To the maximum extent permitted by law, the operator is not responsible for harm caused by alcohol consumption, unsafe conduct, inaccurate self-reporting, another participant’s content or actions, loss of an invitation code, or events outside the operator’s reasonable control.",
      "Nothing in these Terms excludes or limits liability where exclusion is prohibited, including liability for fraud, wilful misconduct, death or personal injury caused by negligence where applicable, data-protection obligations, or mandatory consumer rights. Any limitation must be interpreted narrowly and consistently with Portuguese and EU law.",
    ],
  },
  {
    title: "14. Ending use and changes to the service",
    paragraphs: [
      "You may stop using the app and sign out at any time. Declining these Terms blocks access but does not by itself delete an existing account or server-held content. Because account deletion is not yet implemented, the operator must provide a verified contact and request process before publication.",
      "We may update the service and these Terms. Editorial changes may be shown in Settings. If a change materially affects rights, responsibilities or data use, the document version will change and the app will require acceptance again before normal access. The effective date and version appear at the beginning of the document.",
    ],
  },
  {
    title: "15. Governing law and disputes",
    paragraphs: [
      "These Terms are governed by Portuguese law and applicable European Union law. This choice does not deprive a consumer of mandatory protections provided by the law of their habitual residence. Courts and dispute procedures are determined by mandatory applicable rules; these Terms do not impose an exclusive venue where doing so would be unlawful.",
      "The operator’s commercial or non-commercial status and, if applicable, the competent Portuguese consumer alternative-dispute-resolution body must be identified before publication.",
    ],
  },
  {
    title: "16. Contact and legal notices",
    paragraphs: [
      "Before public release, this section must identify the service operator/data controller, geographic or service address, and a monitored email address for legal, privacy, security and content concerns. Do not publish or rely on these Terms until those details and the related procedures are completed and legally reviewed.",
    ],
  },
];

export const PRIVACY_INTRO =
  "This notice explains the current repository implementation. It must be completed with the operator’s identity, contact details and approved retention schedule before public release.";

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    title: "Controller and scope",
    paragraphs: [
      "The legal person or natural person operating COUNT THE JOLS will be the data controller and must be named here before publication. This notice applies to the app, API and private photo storage.",
      "Where applicable, personal-data processing is governed by Regulation (EU) 2016/679 (the General Data Protection Regulation or GDPR), Portuguese Law No. 58/2019 and other applicable Portuguese and European privacy law.",
      "Accepting the Terms is not blanket GDPR consent. Core processing is needed to provide the requested account and private-night service. Any optional purpose that legally requires consent must have a separate, specific choice and a way to withdraw it.",
    ],
  },
  {
    title: "Data the app handles",
    bullets: [
      "Account data: user ID, username, Argon2 password hash, optional avatar and timestamp of legal-age self-attestation.",
      "Session and security data: hashed refresh tokens, expiry times, first-party web session cookie, and short login-attempt counters keyed by one-way hashes derived from IP address and username. Hosting providers may also create ordinary security/access logs.",
      "Night data: night name, invitation codes, host, members, roles, teams, mode, settings, timestamps, scores and personal history visibility/removal markers.",
      "Content and interactions: rear photographs, selfies, declared regular-beer and pint quantities, reactions, Party attempts and votes. Uploaded images are re-encoded as JPEG and metadata is removed.",
      "Device choices: camera and photo-library permission state is controlled by the device/browser. The app uses the camera for check-ins and the library only when you choose a profile picture.",
      "Local functional data: the Terms decision, document version and decision time; native session data in secure storage; temporary unsubmitted captures during the current app session.",
    ],
    paragraphs: [
      "The current code does not request contacts, precise location, microphone access or payment data, and does not include advertising or analytics SDKs.",
    ],
  },
  {
    title: "Why data is used",
    paragraphs: [
      "Account, membership, photographs, scoring and session data are used to register and authenticate people, provide invitation-only nights, display the feed and profile, calculate results, preserve history and maintain sessions. The expected legal basis is performance of the service agreement under Article 6(1)(b) GDPR.",
      "Rate limiting, access control, signed photo links, troubleshooting and service integrity may rely on the operator’s legitimate interests under Article 6(1)(f), after the required balancing and documentation. Processing required by law relies on Article 6(1)(c). Optional processing will rely on consent only where it is freely given and separately requested.",
      "The OpenAI daily-celebration request contains a calendar date and a general search prompt, not usernames, photographs, competition content or account identifiers. The resulting public fact and source are stored in the app database.",
    ],
  },
  {
    title: "Who can see night content",
    paragraphs: [
      "People who enter an invitation-only night can see content according to their role. Invited spectators can see and react to photographs but cannot post or score. In Battle, a host can temporarily hide opposing teams’ scores and photographs; both teams can see them when the Battle ends. Finished nights and photographs remain available in members’ history. Hiding a night moves it to Hidden nights, where it can still be opened. Removing it prevents that member from reopening it.",
      "Personal history removal does not delete shared records for other members. Other participants may independently make screenshots or copies outside the operator’s control.",
    ],
  },
  {
    title: "Processors and transfers",
    paragraphs: [
      "Render hosts the web app and API. Supabase provides PostgreSQL and a private photo bucket. Their authorised subprocessors may process limited technical data needed to provide those services. OpenAI is used only for non-user-specific daily celebration research in the current code.",
      "The production Supabase region, provider contracts, subprocessor lists, backup locations and any transfer outside the European Economic Area must be verified. Where a restricted international transfer occurs, the controller must document an adequacy decision or appropriate safeguards and explain how to obtain a copy.",
    ],
  },
  {
    title: "Storage, security and retention",
    paragraphs: [
      "Passwords are hashed with Argon2. Photo storage is private and displayed through signed links that expire after ten minutes. Access tokens expire after fifteen minutes; refresh sessions can last up to thirty days and rotate. Browser refresh tokens use a secure, HttpOnly, same-site cookie. Backend permissions restrict nights by membership and role.",
      "No system is completely secure. The repository does not yet define a complete retention and backup-deletion schedule. Accounts, shared photos and night records currently remain stored unless a specific feature replaces or removes them; expired refresh sessions and login-attempt rows also require an approved cleanup policy. A lawful, documented schedule must be adopted before public release.",
    ],
  },
  {
    title: "Your GDPR rights",
    paragraphs: [
      "Subject to the conditions and exceptions in applicable law, you may request access, correction, deletion, restriction, portability, or object to processing based on legitimate interests. You may withdraw separately given consent at any time without affecting earlier lawful processing. You may also complain to the Portuguese supervisory authority, Comissão Nacional de Proteção de Dados (CNPD), or another competent authority.",
      "The app currently lets you change a username/avatar and hide or remove a night from personal history, but it does not yet provide full account deletion or an in-app GDPR request form. The controller must publish a monitored contact and a verified request/identity-check process before release.",
    ],
  },
  {
    title: "Necessary local storage",
    paragraphs: [
      "The Terms decision and version are stored locally only to enforce the requested first-use choice and material-update flow. Session storage and the web refresh cookie are strictly necessary to keep a requested authenticated session working and secure. They are not used for advertising or cross-site tracking.",
    ],
  },
];
