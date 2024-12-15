import { PARAMS } from "../constants.mjs";
import { sendErrorToEmail } from '../logging/emailLogging.mjs';
import { checkIfGenerationIsValid, isValidPhoneNumber } from '../utils/supabaseUtils.mjs';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';

export const scrapeSunoSongHandler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    const body = JSON.parse(event.body);
    const generationId = body.generation_id;
    const maxRuntime = body.max_runtime;
    const phoneNumber = body.phone_number;

    console.log('Parsed body:', { generationId, maxRuntime, phoneNumber });

    try {
        const generationCheck = await checkIfGenerationIsValid(generationId);
        if (generationCheck != generationId) {
            console.log("The generation is invalid.")
            throw new Error(generationCheck);
        }

        console.log("The generation is valid.")

        const phoneNumberCheck = await isValidPhoneNumber(phoneNumber);
        if (phoneNumberCheck != phoneNumber) {
            console.log("The phone number is invalid.");
            throw new Error(phoneNumberCheck);
        }

        console.log("The phone number is valid.")

        if (!maxRuntime || maxRuntime == "") {
            console.log("The max runtime is null.");
            throw new Error("The max runtime is null.");
        }

        console.log("The max runtime is not null.");

        if (parseInt(maxRuntime) <= PARAMS.FARGATE_WARMUP) {
            console.log("The max runtime for this call is smaller than or equal to the Fargate warmup time.");
            throw new Error("The max runtime for this call is smaller than or equal to the Fargate warmup time.");
        }

        console.log("The max runtime is big enough.");

        const runtimeWithErrorMargin = parseInt(maxRuntime) - PARAMS.FARGATE_WARMUP;
        if (runtimeWithErrorMargin < PARAMS.MIN_RUNTIME || runtimeWithErrorMargin > PARAMS.MAX_RUNTIME) {
            console.log("Invalid runtime for the scraper.");
            throw new Error("Invalid runtime for the scraper.");
        }

        // Initialize ECS client
        const ecs = new ECSClient({ region: process.env.TARGET_REGION });

        const runTaskCommand = new RunTaskCommand({
            cluster: process.env.ECS_CLUSTER,
            taskDefinition: process.env.TASK_DEFINITION,
            launchType: 'FARGATE',
            overrides: {
                containerOverrides: [
                    {
                        name: process.env.CONTAINER_NAME,
                        environment: [
                            { name: 'PHONE_NUMBER', value: phoneNumber },
                            { name: 'MAX_RUNTIME', value: runtimeWithErrorMargin.toString() },
                            { name: 'GENERATION_ID', value: generationId }
                        ]
                    }
                ]
            },
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: process.env.SUBNETS.split(','),
                    securityGroups: process.env.SECURITY_GROUPS.split(','),
                    assignPublicIp: 'ENABLED'
                }
            }
        });

        const runTaskResponse = await ecs.send(runTaskCommand);
        
        if (!runTaskResponse.tasks || runTaskResponse.tasks.length === 0) {
            console.log("Failed to start the Fargate task.");
            throw new Error('Failed to start the Fargate task.');
        }

        const taskArn = runTaskResponse.tasks[0].taskArn;
        console.log('Fargate task started successfully.');

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Song scraping process started', 
                generation_id: generationId, 
                ecs_task_arn: taskArn
            })
        };
    } catch (error) {
        console.error('Error:', error);
        try {
            await sendErrorToEmail(PARAMS.SCRAPE_SONG_ERROR, error.message, phoneNumber, generationId);
        } catch (emailError) {
            console.error('Failed to send the error email:', emailError);
        }
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                error: error.message || 'An unexpected error occurred'
            }) 
        };
    }
};
