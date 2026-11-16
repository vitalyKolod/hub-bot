// Test fixtures keep the suite runnable without a local .env or production credentials.
for (const [index, name] of ['ADMIN_GROUP_ID', 'CONTENT_GROUP_ID', 'SUPPORT_GROUP_ID', 'SUNDAY_SCREENS_GROUP_ID', 'PROP_WAITLIST_THREAD_ID', 'PROP_STREAM_VERIFY_THREAD_ID'].entries()) {
  process.env[name] ||= String(100001 + index)
}
