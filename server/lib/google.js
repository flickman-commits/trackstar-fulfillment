/**
 * Google's APIs, one package each: Gmail, Drive and Sheets, plus the auth
 * library they share. Same shape as the `googleapis` bundle this replaced
 * (google.gmail({ version, auth }), google.auth.JWT, ...), at a fraction of
 * its size: that package carries every Google API there is (200 MB), and
 * Vercel copied it into every function that touched Gmail or Drive, which
 * was most of a 15-minute deploy.
 */
import { gmail } from '@googleapis/gmail'
import { drive } from '@googleapis/drive'
import { sheets } from '@googleapis/sheets'
import { OAuth2Client, JWT } from 'google-auth-library'

export const google = {
  gmail,
  drive,
  sheets,
  auth: { OAuth2: OAuth2Client, JWT },
}
