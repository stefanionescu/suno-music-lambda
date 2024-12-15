import { PARAMS } from "../constants.mjs";
import { sendErrorToEmail } from '../logging/emailLogging.mjs';
import { checkIfGenerationExists, checkIfSongWasDownloaded } from '../utils/supabaseUtils.mjs';
import { ECSClient, DescribeTasksCommand } from '@aws-sdk/client-ecs';

export const checkSongStatusHandler = async (event) => {
    console.log('Event:', JSON.stringify(event));

    const generationId = event.queryStringParameters.generation_id;
    const ecsTaskArn = event.queryStringParameters.ecs_task_arn;

    console.log('Parsed body:', { generationId, ecsTaskArn });

    try {
        const generationCheck = await checkIfGenerationExists(generationId);
        if (generationCheck != generationId) {
            console.log("The generation ID is invalid.");
            throw new Error(generationCheck);
        }

        console.log("The generation ID is valid.");

        // Initialize ECS client
        const ecs = new ECSClient({ region: process.env.TARGET_REGION });

        const describeTasksCommand = new DescribeTasksCommand({
            cluster: process.env.ECS_CLUSTER,
            tasks: [ecsTaskArn]
        });
        const taskResponse = await ecs.send(describeTasksCommand);
        
        if (!taskResponse.tasks || taskResponse.tasks.length === 0) {
            console.log('ECS task not found.');
            throw new Error('ECS task not found.');
        }

        console.log("ECS task found.");

        const task = taskResponse.tasks[0];
        
        if (task.lastStatus === 'STOPPED') {
            if (task.stopCode !== 'EssentialContainerExited' || task.containers[0].exitCode !== 0) {
                console.log(`ECS task failed: ${task.stoppedReason}`);
                throw new Error(`ECS task failed: ${task.stoppedReason}`);
            }

            console.log("Container exited correctly.");
            
            const songWasDownloaded = await checkIfSongWasDownloaded(generationId);
            if (songWasDownloaded != generationId) {
                console.log("The song data was not downloaded.");
                throw new Error(songWasDownloaded);
            }
            
            console.log("The song data was downloaded.");

            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    message: 'Song was downloaded',
                    generation_id: generationId,
                    ecs_task_status: task.lastStatus, 
                    ecs_task_arn: ecsTaskArn
                })
            };
        }

        console.log("The song is still being created/downloaded.");

        return {
            statusCode: 202,
            body: JSON.stringify({ 
                message: 'Song still being scraped', 
                generation_id: generationId,
                ecs_task_status: task.lastStatus, 
                ecs_task_arn: ecsTaskArn
            })
        };
    } catch(error) {
        console.error('Error:', error);
        try {
            await sendErrorToEmail(PARAMS.SONG_STATUS_ERROR, error.message, null, generationId);
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
}
