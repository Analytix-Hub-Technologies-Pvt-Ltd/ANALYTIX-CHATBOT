param webAppName string = 'ah-chatbot-app'
param location string = 'eastus'
param sku string = 'B1' // Basic plan, supports storage mounts

var appServicePlanName = '${webAppName}-plan'
var storageAccountName = 'ahchatbotstorage${uniqueString(resourceGroup().id)}'
var fileShareName = 'chatbotdata'

// 1. Storage Account for persistence
resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
  }
}

// 2. File Services & Share
resource fileServices 'Microsoft.Storage/storageAccounts/fileServices@2022-09-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2022-09-01' = {
  parent: fileServices
  name: fileShareName
}

// 3. App Service Plan (Linux)
resource appServicePlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: sku
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// 4. Web App with mounted persistent storage
resource webApp 'Microsoft.Web/sites@2022-03-01' = {
  name: webAppName
  location: location
  kind: 'app'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appSettings: [
        {
          name: 'PORT'
          value: '80'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
      ]
      azureStorageAccounts: {
        'db-storage-mount': {
          type: 'AzureFiles'
          accountName: storageAccountName
          shareName: fileShareName
          mountPath: '/home/site/wwwroot/data'
          accessKey: storageAccount.listKeys().keys[0].value
        }
      }
    }
  }
}

output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
