
pipeline {
    agent { label 'built-in' }

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        PM2_NAME = 'ticktrack-api'
        ENV_CREDENTIAL_ID = 'ticktrack-api-env'
        BACKUP_ROOT = "${JENKINS_HOME}/ticktrack-backups"
    }

    stages {

        stage('Backup Current Backend') {
            steps {
                sh '''
                    set -eu

                    mkdir -p "$BACKUP_ROOT"

                    if [ -f "$WORKSPACE/api/package.json" ]; then

                        echo "Backing up existing TickTrack API..."

                        tar -czf \
                            "$BACKUP_ROOT/api-${BUILD_NUMBER}.tar.gz" \
                            --exclude='api/node_modules' \
                            --exclude='api/.git' \
                            --exclude='api/.env.production' \
                            -C "$WORKSPACE" api

                        echo "Backup completed."

                    else
                        echo "No previous API found. First deployment."
                    fi
                '''
            }
        }

        stage('Checkout') {
            steps {
                git credentialsId: 'github-creds-harsh',
                    branch: 'dev',
                    url: 'https://github.com/himanshuNewel12/ticktrack.git'
            }
        }

        stage('Inject Environment') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'ticktrack-api-env',
                        variable: 'API_ENV'
                    )
                ]) {
                    dir('api') {
                        sh '''
                            set -eu
                            set +x

                            install -m 600 "$API_ENV" .env.production

                            echo "TickTrack API environment configured."
                        '''
                    }
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('api') {
                    sh '''
                        set -eu

                        echo "Checking Node.js and npm..."

                        node --version
                        npm --version

                        test -f package.json
                        test -f package-lock.json

                        echo "Installing dependencies..."

                        npm ci
                    '''
                }
            }
        }

        stage('Generate Prisma Client') {
            steps {
                dir('api') {
                    sh '''
                        set -eu

                        echo "Generating Prisma Client..."

                        npx prisma generate

                        echo "Prisma Client generated successfully."
                    '''
                }
            }
        }

        stage('Build Backend') {
            steps {
                dir('api') {
                    sh '''
                        set -eu

                        echo "Building TickTrack NestJS backend..."

                        npm run build

                        test -f dist/main.js

                        echo "NestJS build successful."
                    '''
                }
            }
        }

        stage('Deploy with PM2') {
            steps {
                script {
                    try {
                        sh '''
                            set -eu

                            cd "$WORKSPACE/api"

                            if pm2 describe "$PM2_NAME" \
                                >/dev/null 2>&1; then

                                echo "Restarting $PM2_NAME..."

                                pm2 restart "$PM2_NAME" --update-env

                            else

                                echo "Starting $PM2_NAME..."

                                pm2 start npm \
                                    --name "$PM2_NAME" \
                                    -- run start:prod
                            fi

                            pm2 save

                            echo "TickTrack API deployment completed."
                        '''

                    } catch (Exception err) {

                        echo 'Deployment failed. Attempting rollback.'

                        try {
                            sh '''
                                set -eu

                                BACKUP="$BACKUP_ROOT/api-${BUILD_NUMBER}.tar.gz"

                                if [ ! -f "$BACKUP" ]; then
                                    echo "No previous backup available."
                                    exit 1
                                fi

                                echo "Restoring previous API version..."

                                rm -rf "$WORKSPACE/api"

                                tar -xzf "$BACKUP" -C "$WORKSPACE"

                                cd "$WORKSPACE/api"

                                # Restore the Jenkins-managed environment.

                            '''

                            withCredentials([
                                file(
                                    credentialsId: 'ticktrack-api-env',
                                    variable: 'API_ENV'
                                )
                            ]) {
                                sh '''
                                    set -eu
                                    set +x

                                    install -m 600 "$API_ENV" \
                                        "$WORKSPACE/api/.env.production"
                                '''
                            }

                            sh '''
                                set -eu

                                cd "$WORKSPACE/api"

                                echo "Restoring dependencies..."

                                npm ci

                                npx prisma generate

                                if pm2 describe "$PM2_NAME" \
                                    >/dev/null 2>&1; then

                                    pm2 restart "$PM2_NAME" --update-env

                                else
                                    pm2 start npm \
                                        --name "$PM2_NAME" \
                                        -- run start:prod
                                fi

                                pm2 save

                                echo "Previous API version restored."
                            '''

                        } catch (Exception rollbackErr) {

                            echo 'Rollback failed. Manual intervention required.'
                        }

                        error('TickTrack API deployment failed. Rollback attempted.')
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                sh '''
                    set -eu

                    echo "Checking TickTrack API process..."

                    pm2 describe "$PM2_NAME"

                    pm2 status "$PM2_NAME"

                    echo "TickTrack API verification completed."
                '''
            }
        }
    }

    post {
        success {
            echo 'TickTrack API deployment successful.'
        }

        failure {
            echo 'TickTrack API deployment failed. Check Jenkins console output.'
        }
    }
}
