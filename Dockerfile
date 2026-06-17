FROM node:20-alpine AS build
ARG VITE_API_BASE_URL=/api
ARG VITE_FEATURE_KVM=false
ARG VITE_CORE_SITE_IDS=uc,tacc,ncar
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_FEATURE_KVM=$VITE_FEATURE_KVM
ENV VITE_CORE_SITE_IDS=$VITE_CORE_SITE_IDS
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# /etc/nginx/templates/*.template: nginx envsubst's ${FEEDBACK_SCRIPT_URL} into this at container start.
COPY nginx.conf /etc/nginx/templates/default.conf.template
# /docker-entrypoint.d/*: nginx runs this at container start to write FEEDBACK_SHARED_SECRET into env-config.js.
COPY docker/generate-feedback-config.sh /docker-entrypoint.d/30-generate-feedback-config.sh
RUN chmod +x /docker-entrypoint.d/30-generate-feedback-config.sh
EXPOSE 80
