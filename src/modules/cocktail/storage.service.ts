import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
    private readonly logger = new Logger(StorageService.name);
    private readonly s3Client: S3Client;
    private readonly bucket: string;

    constructor(private readonly configService: ConfigService) {
        const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
        const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
        this.bucket = this.configService.get<string>('R2_BUCKET', 'sandbox-airnode');

        this.s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: accessKeyId!,
                secretAccessKey: secretAccessKey!,
            },
        });
    }

    async getPresignedPutUrl(key: string, contentType: string, expiresIn = 600): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });

        return getSignedUrl(this.s3Client, command, { expiresIn });
    }

    async getPresignedGetUrl(key: string, expiresIn = 1800): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return getSignedUrl(this.s3Client, command, { expiresIn });
    }

    async deleteObject(key: string): Promise<void> {
        try {
            await this.s3Client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            }));
        } catch (e) {
            this.logger.error(`Failed to delete object ${key}`, e);
        }
    }
}
