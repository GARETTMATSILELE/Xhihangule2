using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using PropertyManagement.Infrastructure.Configuration;
using PropertyManagement.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.Configure<AzureSettings>(
    builder.Configuration.GetSection("AzureSettings"));

builder.Services.AddScoped<IAzureService, AzureService>();
builder.Services.AddScoped<IAzureAccountValidator, AzureAccountValidator>();

// Add other services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run(); 