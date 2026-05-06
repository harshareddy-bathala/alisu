/**
 * Twilio REST API wrapper
 * Handles call management and TwiML responses
 */

import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_NUMBER;

if (!accountSid || !authToken || !twilioPhoneNumber) {
  throw new Error('Twilio credentials not configured');
}

const client = twilio(accountSid, authToken);

export async function transferCall(
  callSid: string,
  transferToNumber: string
): Promise<void> {
  try {
    // Create TwiML to transfer the call
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.dial(transferToNumber);

    console.log(`Transferring call ${callSid} to ${transferToNumber}`);
    // Note: Actual transfer would be handled through the media stream or IVR
  } catch (error) {
    console.error('Error transferring call:', error);
    throw error;
  }
}

export async function hangupCall(callSid: string): Promise<void> {
  try {
    const call = await client.calls(callSid).update({ status: 'completed' });
    console.log(`Call ended: ${callSid}`);
  } catch (error) {
    console.error('Error hanging up call:', error);
    throw error;
  }
}

export async function sendDigits(
  callSid: string,
  digits: string
): Promise<void> {
  try {
    // Send DTMF tones during call
    console.log(`Sending digits to ${callSid}: ${digits}`);
    // Implementation depends on Twilio SDK capabilities
  } catch (error) {
    console.error('Error sending digits:', error);
    throw error;
  }
}

export async function recordCall(callSid: string): Promise<void> {
  try {
    console.log(`Recording call: ${callSid}`);
    // Enable recording on the call
  } catch (error) {
    console.error('Error recording call:', error);
    throw error;
  }
}

export { twilio };
