import { Module } from '@nestjs/common';
import { CredentialService } from './credential.service.js';

@Module({
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
