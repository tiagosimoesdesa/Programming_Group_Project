# Validation record

Automated checks were run on Windows during implementation. Physical-device checks remain in `DEVICE_TESTS.md`.

- Backend API suite: 11 passing tests against SQLite, including concurrent retry deduplication and closure while uploading.
- Alembic initial migration: applied successfully to a fresh SQLite database; metadata comparison reports no pending upgrade operations.
- OpenAPI contract exported and TypeScript client models generated.
- Strict TypeScript check: passed.
- Production JavaScript/Hermes bundles: exported successfully for both iOS and Android. This is a bundle check, not a signed IPA/APK or a device test.
- Expo SDK package compatibility: passed using the installed SDK's local compatibility table (offline mode).
- PostgreSQL checks are configured in GitHub Actions but have not been run locally; no PostgreSQL service is available on this PC.
- Supabase and Render integration needs real account credentials and a hosted smoke test.

## Dependency audit

The first-release app intentionally uses Expo SDK 54 for App Store Expo Go compatibility. A compatible PostCSS security override is applied. The SDK's older build-tool dependency chain still reports advisories, including a high-severity `image-size` parser denial-of-service issue and moderate glob/minimatch issues. Do not process untrusted local build assets/configurations with this toolchain. The mobile app sends user photos to the Python backend; it does not parse them with Metro's `image-size` package.

The `image-size` fix changes its file-path API, which this Metro release uses, so a blind major-version override would break builds. Upgrade Expo/Metro together and repeat native-device validation before public distribution; this may require a custom iOS development build and Apple developer enrollment. See the current `npm audit` output for exact advisory details.
