function publicEmailSettings(settings) {
  if (!settings) {
    return {
      enabled: false,
      provider: 'none',
      smtpHost: '',
      smtpPort: '',
      secureMode: 'starttls',
      smtpUser: '',
      smtpPasswordSet: false,
      fromName: '',
      fromEmail: '',
      replyToEmail: '',
      lastTestedAt: null,
      lastTestStatus: '',
      lastTestError: '',
    };
  }

  return {
    enabled: Boolean(settings.enabled),
    provider: settings.provider || 'none',
    smtpHost: settings.smtpHost || '',
    smtpPort: settings.smtpPort || '',
    secureMode: settings.secureMode || 'starttls',
    smtpUser: settings.smtpUser || '',
    smtpPasswordSet: Boolean(settings.smtpPassEncrypted),
    fromName: settings.fromName || '',
    fromEmail: settings.fromEmail || '',
    replyToEmail: settings.replyToEmail || '',
    lastTestedAt: settings.lastTestedAt || null,
    lastTestStatus: settings.lastTestStatus || '',
    lastTestError: settings.lastTestError || '',
  };
}

module.exports = { publicEmailSettings };
