import 'aws-sdk-client-mock-jest';
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { ECSClient, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { checkSongStatusHandler } from '../../../src/handlers/check-song-status.mjs';

const ecsMock = mockClient(ECSClient);

const mockEnv = {
    TARGET_REGION: "your-region-here",
    SUPABASE_JWT_SECRET: "",
    SUPABASE_ANON_KEY: "",
    SUPABASE_URL: "",
    SENDGRID_API_KEY: "",
    SENDGRID_TO: "",
    SENDGRID_FROM: "",
    NODE_OPTIONS: "--dns-result-order=ipv4first"
};

describe('checkSongStatusHandler Tests', () => {
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

    it('should return 202 status code when song is still being scraped', async () => {
        const mockEvent = {
            httpMethod: 'GET',
            queryStringParameters: {
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                ecs_task_arn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id'
            }
        };

        ecsMock.on(DescribeTasksCommand).resolves({
            tasks: [{
                taskArn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id',
                lastStatus: 'RUNNING'
            }]
        });

        const result = await checkSongStatusHandler(mockEvent);

        expect(result.statusCode).toBe(202);
        expect(JSON.parse(result.body)).toEqual({
            message: 'Song still being scraped',
            generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
            ecs_task_status: 'RUNNING',
            ecs_task_arn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id'
        });
    });

    it('should return 500 status code when generation check fails', async () => {
        const mockEvent = {
            httpMethod: 'GET',
            queryStringParameters: {
                generation_id: 'invalid-id',
                ecs_task_arn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id'
            }
        };

        const result = await checkSongStatusHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'invalid input syntax for type uuid: \"invalid-id\"');
    });

    it('should return 500 status code when ECS task is not found', async () => {
        const mockEvent = {
            httpMethod: 'GET',
            queryStringParameters: {
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                ecs_task_arn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id'
            }
        };

        ecsMock.on(DescribeTasksCommand).resolves({
            tasks: []
        });

        const result = await checkSongStatusHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'ECS task not found');
    });

    it('should return 500 status code when ECS task failed', async () => {
        const mockEvent = {
            httpMethod: 'GET',
            queryStringParameters: {
                generation_id: 'c678a46c-fd62-45d2-b0c9-c08a3065a514',
                ecs_task_arn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id'
            }
        };

        ecsMock.on(DescribeTasksCommand).resolves({
            tasks: [{
                taskArn: 'arn:aws:ecs:your-region-here:account-id:task/fargate-suno-scraper-cluster/id',
                lastStatus: 'STOPPED',
                stopCode: 'TaskFailed',
                containers: [{ exitCode: 1 }],
                stoppedReason: 'Essential container in task exited'
            }]
        });

        const result = await checkSongStatusHandler(mockEvent);

        expect(result.statusCode).toBe(500);
        expect(JSON.parse(result.body)).toHaveProperty('error', 'ECS task failed: Essential container in task exited');
    });
});