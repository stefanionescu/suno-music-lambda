import sgMail from '@sendgrid/mail';
import { PARAMS } from "../constants.mjs";

/**
 * Formats the current date and time as DD/MM/YY HH:MM:SS
 * @returns {string} Formatted date and time string
 */
function formatCurrentDateTime() {
    const now = new Date();
    
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
  
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

export async function sendErrorToEmail(errorType, errorMessage, phoneNumber, generationId) {
    if (errorType != PARAMS.SCRAPE_SONG_ERROR && errorType != PARAMS.SONG_STATUS_ERROR) {
        console.log("Invalid error type. Cannot email this.");
        return false;
    }

    if (!errorMessage) {
        console.error("Cannot email a message without an error message.");
        return false;
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    let emailTitle = errorType == PARAMS.SCRAPE_SONG_ERROR ? PARAMS.EMAIL_LOGGING_TITLE_CALL_FARGATE : PARAMS.EMAIL_LOGGING_TITLE_CHECK_FARGATE_TASK;
    let emailContent = errorType == PARAMS.SCRAPE_SONG_ERROR ? PARAMS.EMAIL_FORMATTED_MESSAGE_CALL_FARGATE : PARAMS.EMAIL_FORMATTED_MESSAGE_CHECK_FARGATE;

    const formattedPhoneNumber = (phoneNumber == null || phoneNumber == "") ? "None" : phoneNumber;
    const formattedGenerationId = (generationId == null || generationId == "") ? "None" : generationId;

    if (errorType == PARAMS.SCRAPE_SONG_ERROR) {
        emailContent = emailContent.replace('{phoneNumber}', formattedPhoneNumber).replace('{generationId}', formattedGenerationId);
    } else {
        emailContent = emailContent.replace('{generationId}', formattedGenerationId);
    } 

    const msg = {
        to: process.env.SENDGRID_TO,
        from: process.env.SENDGRID_FROM,
        subject: emailTitle.replace('{time}', formatCurrentDateTime()),
        text: emailContent.replace('{errorMessage}', errorMessage),
    };

    try {
        const response = await sgMail.send(msg);
        if (response[0].statusCode === 202 || response[0].statusCode == 200) {
            console.log("Lambda error sent!");
            return true;
        } else {
            console.error("Failed to send the error, status code:", response[0].statusCode);
            return false;
        }
    } catch (error) {
        console.error("Error in sending email:", error);
        return false;
    }
}