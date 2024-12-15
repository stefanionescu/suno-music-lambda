import 'aws-sdk-client-mock-jest';
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import { scrapeSunoSongHandler } from '../../../src/handlers/scrape-suno-song.mjs';

const ecsMock = mockClient(ECSClient);

const mockEnv = {
    TARGET_REGION: "your-region-here",
    ECS_CLUSTER: "fargate-suno-scraper-cluster",
    TASK_DEFINITION: "arn:aws:ecs:your-region-here:aws-account-id:task-definition/fargate-suno-scraper-task:tasknumber",
    SUBNETS: "subnet-id,subnet-id,subnet-id",
    SECURITY_GROUPS: "sg-id",
    CONTAINER_NAME: "fargate-suno-scraper-container",
    PHONE_NUMBERS: "number1,number2,number3",
    SUPABASE_JWT_SECRET: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_URL: "",
    SENDGRID_API_KEY: "",
    SENDGRID_TO: "",
    SENDGRID_FROM: "",
    NODE_OPTIONS: "--dns-result-order=ipv4first"
};

describe('scrapeSunoSongHandler Tests', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        ecsMock.reset();
        Object.keys(mockEnv).forEach(key => {
            process.env[key] = mockEnv[key];
        });
    });

    afterEach(() => {
        Object.keys(mockEnv).forEach(key => {
            delete process.env[key];
        });
    });

    it('should return 200 status code when task starts successfully', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                max_runtime: '600',
                phone_number: 'numberhere'
            })
        };

        const mockTaskArn = `arn:aws:ecs:${mockEnv.TARGET_REGION}:aws-account-id:task/${mockEnv.ECS_CLUSTER}/tasknumber`;

        ecsMock.on(RunTaskCommand).resolves({
            tasks: [{ taskArn: mockTaskArn }]
        });

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toEqual({
            message: 'Song scraping process started',
            generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
            ecs_task_arn: mockTaskArn
        });

        expect(ecsMock).toHaveReceivedCommandWith(RunTaskCommand, {
            cluster: mockEnv.ECS_CLUSTER,
            taskDefinition: mockEnv.TASK_DEFINITION,
            launchType: 'FARGATE',
            overrides: {
                containerOverrides: [
                    {
                    name: mockEnv.CONTAINER_NAME,
                    environment: expect.arrayContaining([
                        { name: 'PHONE_NUMBER', value: '' },
                        { name: 'MAX_RUNTIME', value: '500' },
                        { name: 'GENERATION_ID', value: 'c678a46c-fd62-45d2-b0c9-c08a3065a514' }
                    ])
                    }
                ]
            },
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: mockEnv.SUBNETS.split(','),
                    securityGroups: mockEnv.SECURITY_GROUPS.split(','),
                    assignPublicIp: 'ENABLED'
                }
            }
        });
    });

    it('should return 500 status code when task fails to start', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                max_runtime: '600',
                phone_number: ''
            })
        };

        ecsMock.on(RunTaskCommand).resolves({
            tasks: [] // Simulate a failure to start the task
        });

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'Failed to start task');
    });

    it('should return 500 status code when generation check fails', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'invalid-id',
                max_runtime: '600',
                phone_number: ''
            })
        };

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'Error checking if a song generation exists: invalid input syntax for type uuid: \"invalid-id\"');
    });

    it('should return 500 status code when phone number is invalid', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                max_runtime: '600',
                phone_number: 'invalid-phone'
            })
        };

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'Null scraper/phone number data.');
    });

    it('should return 500 status code when max runtime is null', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                max_runtime: '',
                phone_number: ''
            })
        };

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'The max runtime is null.');
    });

    it('should return 500 status code when max runtime is small', async () => {
        const mockEvent = {
            body: JSON.stringify({
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                max_runtime: '100',
                phone_number: ''
            })
        };

        const result = await scrapeSunoSongHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'The max runtime for this call is smaller than or equal to the Fargate warmup time.');
    });
});