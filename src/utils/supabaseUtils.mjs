import jwt from 'jsonwebtoken';
import { PARAMS } from "../constants.mjs";
import { createClient } from '@supabase/supabase-js';

function generateSunoScraperJWT() {
    const payload = {
        aud: "authenticated",
        role: "authenticated",
        app_role: PARAMS.SUPABASE_AWS_LAMBDA_ROLE,
        exp: Math.floor(Date.now() / 1000) + PARAMS.SUPABASE_JWT_LIFETIME
    };
    return jwt.sign(payload, process.env.SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

function getSupabaseClient(token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
        db: { schema: PARAMS.SUPABASE_SCHEMA },
        global: {
            headers: { 'Authorization': `Bearer ${token}` },
        },
    });
}

export async function checkIfSongWasDownloaded(generationId) {
    if (!generationId) {
        throw "Invalid generation ID.";
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        const { data: generation, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_SONG_GENERATIONS_TABLE)
            .select('output_song, song_output_genre, song_output_title, song_output_lyrics')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError.message;
        }

        if (!generation) {
            throw "Could not pull the generation data from Supabase.";
        }

        if (!generation.song_output_genre || generation.song_output_genre == null || generation.song_output_genre == "" ||
            !generation.song_output_title || generation.song_output_title == null || generation.song_output_title == "" ||
            !generation.song_output_lyrics || generation.song_output_lyrics == null || generation.song_output_lyrics == "") {
            throw "Invalid output genre, output song title or output song lyrics."
        }

        // Check if output_song includes the song key
        let outputSong = generation.output_song;
        if (!outputSong.song || outputSong.song == "") {
            throw new "Invalid song in output_song: " + generationId;
        }

        const { data: file, error: fileError } = await supabase
            .storage
            .from(PARAMS.SUPABASE_SONG_BUCKET)
            .list('', {
                limit: 1,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
                search: outputSong.song_key
            });

        if (fileError && fileError.message !== 'File not found') {
            throw fileError.message;
        }

        if (file) {
            return generationId;
        }

        return "Could not find a song associated with the generation in the audio bucket.";
    } catch(error) {
        return error.message
    }
}

export async function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber) {
        return "Got a null phone number";
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        const { data: phoneNumberStatus, error: phoneNumberError } = await supabase
            .from(PARAMS.SUPABASE_SCRAPER_STATUS_TABLE)
            .select('*')
            .eq('phone_number', phoneNumber)
            .maybeSingle();

        if (phoneNumberError && phoneNumberError.message !== 'No rows found') {
            return "Could not find the phone number on Supabase.";
        }

        if (!phoneNumberStatus) {
            return "Null scraper/phone number data.";
        }

        if (phoneNumberStatus.latest_error != null) {
            return "The phone number already has an associated error."
        }

        const credits = phoneNumberStatus.remaining_credits;
        if (!credits || parseInt(credits) <= PARAMS.MIN_SUNO_CREDIT_BALANCE) {
            return "Invalid Suno credits number.";
        }

        return phoneNumber;
    } catch(error) {
        return "Error checking the validity of a phone number: " + error;
    }
}

export async function checkIfGenerationExists(generationId) {
    if (!generationId) {
        throw "Invalid generation ID."
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        const { data: generation, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_SONG_GENERATIONS_TABLE)
            .select('*')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError.message;
        }

        if (!generation) {
            throw "Could not pull the generation data from Supabase.";
        }

        if (generation.user_id != null && generation.user_id != "") {
            return generationId;
        }

        return "Checked the generation user ID but it was empty.";
    } catch(error) {
        return "Error checking if the generation exists: " + error.message;
    }
}

export async function checkIfGenerationIsValid(generationId) {
    if (!generationId) {
        return "Invalid generation ID.";
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        const { data: generation, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_SONG_GENERATIONS_TABLE)
            .select('*')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError.message;
        }

        if (!generation) {
            throw "Could not pull the generation data from Supabase.";
        }

        // Check if initial_reply_id, replies_guild, replies_channel_id are not null or empty strings
        if (!generation.initial_reply_id || generation.initial_reply_id === '' ||
            !generation.replies_guild || generation.replies_guild === '' ||
            !generation.replies_channel_id || generation.replies_channel_id === '') {
            return "Invalid generation info: " + generationId;
        }

        if (generation.error_message != null) {
            return "This generation had a prior error.";
        }

        if (generation.output_song != null ||
            generation.song_output_genre != null ||
            generation.song_output_title != null ||
            generation.song_output_lyrics != null ||
            generation.song_output_cover != null) {
            return "This generation already has output data."
        }

        return generationId;
    } catch (error) {
        return "Error checking if a song generation exists: " + error;
    }
}

export async function checkIfNoLyricVideo(generationId) {
    if (!generationId) {
        return "Invalid generation ID.";
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        const { data: generation, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_SONG_GENERATIONS_TABLE)
            .select('song_output_lyrics_video')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError.message;
        }

        if (!generation) {
            throw "Could not pull the generation data from Supabase.";
        }

        if (generation.song_output_lyrics_video != null) {
            return "This generation already has a lyrics video.";
        }

        return generationId;
    } catch(error) {
        return error;
    }
}

export async function downloadSongFile(generationId) {
    if (!generationId) {
        return null;
    }

    const token = generateSunoScraperJWT();
    const supabase = getSupabaseClient(token);

    try {
        // Get the song file path
        const { data: generation, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_SONG_GENERATIONS_TABLE)
            .select('output_song, song_output_title')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError.message;
        }

        if (!generation) {
            throw "Could not pull the generation data from Supabase.";
        }

        let outputSong = generation.output_song;
        if (!outputSong.song || outputSong.song == "") {
            throw new "Invalid song in output_song: " + generationId;
        }

        // Get song file from Supabase bucket
        const { data, error } = await supabase
          .storage
          .from(PARAMS.SUPABASE_SONG_BUCKET)
          .createSignedUrl(outputSong.song, PARAMS.MAX_SONG_DOWNLOAD_WAIT_TIME);
    
        if (error) throw error;
    
        // Download the file
        const response = await axios.get(data.signedUrl, { responseType: 'arraybuffer' });

        if (!response.data || response instanceof ArrayBuffer && response.byteLength === 0) {
            throw Error(`There's no audio file at ${songFilePath}.`);
        }

        return {
            song_file: Buffer.from(response.data, 'binary'),
            song_title: song_output_title.song_output_title
        }
    } catch(error) {
        console.error('SUPABASE: Error downloading the song file:', error);
        return null;
    }
}