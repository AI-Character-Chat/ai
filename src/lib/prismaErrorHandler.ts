/**
 * Prisma 에러 핸들링 유틸리티
 * 
 * 공식 문서 기반: https://www.prisma.io/docs/orm/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors
 */

import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

/**
 * Prisma 에러를 사용자 친화적인 메시지로 변환
 */
export function handlePrismaError(error: unknown): {
  message: string;
  status: number;
  code?: string;
} {
  // Prisma 알려진 요청 에러 (공식 문서: PrismaClientKnownRequestError)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        return {
          message: '중복된 데이터가 있습니다.',
          status: 409,
          code: error.code,
        };
      
      case 'P2025':
        // Record not found
        return {
          message: '요청한 데이터를 찾을 수 없습니다.',
          status: 404,
          code: error.code,
        };
      
      case 'P2003':
        // Foreign key constraint failed
        return {
          message: '관련된 데이터가 있어 삭제할 수 없습니다.',
          status: 400,
          code: error.code,
        };
      
      case 'P2014':
        // Required relation violation
        return {
          message: '필수 관계가 위반되었습니다.',
          status: 400,
          code: error.code,
        };
      
      default:
        console.error('Prisma 에러 코드:', error.code);
        return {
          message: '데이터베이스 오류가 발생했습니다.',
          status: 500,
          code: error.code,
        };
    }
  }
  
  // Prisma 초기화 에러 (공식 문서: PrismaClientInitializationError)
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error('Prisma 초기화 에러:', error.message);
    return {
      message: '데이터베이스 연결에 실패했습니다.',
      status: 503,
    };
  }
  
  // Prisma 유효성 검사 에러 (공식 문서: PrismaClientValidationError)
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error('Prisma 유효성 검사 에러:', error.message);
    return {
      message: '입력 데이터가 올바르지 않습니다.',
      status: 400,
    };
  }
  
  // 일반 에러
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    message: errorMessage,
    status: 500,
  };
}

/**
 * Prisma 에러를 NextResponse로 변환
 */
export function prismaErrorToResponse(error: unknown): NextResponse {
  const { message, status, code } = handlePrismaError(error);
  
  return NextResponse.json(
    {
      error: message,
      code: code,
      details: process.env.NODE_ENV === 'development' 
        ? (error instanceof Error ? error.message : String(error))
        : undefined,
    },
    { status }
  );
}
