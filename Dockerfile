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
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
